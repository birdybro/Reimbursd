// SPDX-License-Identifier: GPL-3.0-only
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createManualReceipt, ReceiptValidationError, type Receipt } from '@reimbursd/domain';
import { Pool } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  hostedMigrations,
  hostedSchemaVersion,
  migrateHostedDatabase,
  type HostedMigration,
} from './postgres-migrations.js';
import { PostgresHostedReceiptRepository } from './postgres-receipt-repository.js';
import { HostedReceiptAlreadyExistsError } from './receipt-repository.js';

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
let container: StartedPostgreSqlContainer | null = null;
let pool: Pool | null = null;

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return createManualReceipt({
    capturedAt: '2026-07-18T12:00:00-06:00',
    currencyCode: 'USD',
    id: '10000000-0000-4000-8000-000000000001',
    merchantId: '20000000-0000-4000-8000-000000000001',
    merchantName: 'Synthetic Merchant',
    notes: 'Synthetic test data only',
    purchasedAt: '2026-07-18T11:30:00-06:00',
    subtotalMinor: 1_000,
    taxMinor: 80,
    tipMinor: 200,
    totalMinor: 1_280,
    ...overrides,
  });
}

function requirePool(): Pool {
  if (!pool) {
    throw new Error('PostgreSQL test pool is not initialized.');
  }

  return pool;
}

describe.sequential('PostgreSQL hosted receipt persistence', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('reimbursd_test')
      .withUsername('reimbursd_test')
      .withPassword('synthetic-test-password')
      .start();
    pool = new Pool({ connectionString: container.getConnectionUri(), max: 5 });
  }, 60_000);

  afterAll(async () => {
    if (pool) {
      await pool.end();
      pool = null;
    }

    if (container) {
      await container.stop();
      container = null;
    }
  }, 30_000);

  beforeEach(async () => {
    const database = requirePool();
    await database.query(`
      DROP TABLE IF EXISTS hosted_receipts CASCADE;
      DROP TABLE IF EXISTS hosted_merchants CASCADE;
      DROP TABLE IF EXISTS hosted_schema_migrations CASCADE;
    `);
    await migrateHostedDatabase(database);
  });

  it('runs ordered migrations idempotently', async () => {
    const database = requirePool();
    await migrateHostedDatabase(database);
    const result = await database.query<{ name: string; version: number }>(
      'SELECT version, name FROM hosted_schema_migrations ORDER BY version;',
    );

    expect(result.rows).toEqual(hostedMigrations.map(({ name, version }) => ({ name, version })));
    expect(hostedSchemaVersion).toBe(1);
  });

  it('rolls back schema and metadata when a migration fails', async () => {
    const database = requirePool();
    const failingMigration: HostedMigration = {
      name: 'synthetic_rollback_probe',
      sql: `
        CREATE TABLE hosted_rollback_probe (id INTEGER PRIMARY KEY);
        SELECT 1 / 0;
      `,
      version: 2,
    };

    await expect(
      migrateHostedDatabase(database, [...hostedMigrations, failingMigration]),
    ).rejects.toThrow();

    const probe = await database.query<{ relation: string | null }>(
      "SELECT to_regclass('public.hosted_rollback_probe')::text AS relation;",
    );
    const versions = await database.query<{ version: number }>(
      'SELECT version FROM hosted_schema_migrations ORDER BY version;',
    );
    expect(probe.rows[0]?.relation).toBeNull();
    expect(versions.rows).toEqual([{ version: 1 }]);
  });

  it('rejects databases created by a newer application schema', async () => {
    const database = requirePool();
    await database.query(
      `
        INSERT INTO hosted_schema_migrations (version, name, applied_at)
        VALUES ($1, $2, $3);
      `,
      [999, 'future', new Date()],
    );

    await expect(migrateHostedDatabase(database)).rejects.toThrow(
      'Hosted database schema version 999 is newer than supported version 1.',
    );
  });

  it('rejects migration history that does not match the application', async () => {
    const database = requirePool();
    await database.query('UPDATE hosted_schema_migrations SET name = $1 WHERE version = $2;', [
      'unexpected_name',
      1,
    ]);

    await expect(migrateHostedDatabase(database)).rejects.toThrow(
      'Hosted database migration history does not match this application.',
    );
  });

  it('persists a receipt across repository and connection replacement', async () => {
    const database = requirePool();
    const receipt = makeReceipt();
    await new PostgresHostedReceiptRepository(database).create(ownerA, receipt);

    const reopenedPool = new Pool({
      connectionString: container?.getConnectionUri(),
      max: 2,
    });

    try {
      const reopenedRepository = new PostgresHostedReceiptRepository(reopenedPool);
      await expect(reopenedRepository.getByIdForOwner(ownerA, receipt.id)).resolves.toEqual(
        receipt,
      );
    } finally {
      await reopenedPool.end();
    }
  });

  it('makes another owner unable to read the receipt', async () => {
    const repository = new PostgresHostedReceiptRepository(requirePool());
    const receipt = makeReceipt();
    await repository.create(ownerA, receipt);

    await expect(repository.getByIdForOwner(ownerB, receipt.id)).resolves.toBeNull();
    await expect(repository.getByIdForOwner(ownerA, receipt.id)).resolves.toEqual(receipt);
    await expect(repository.getByIdForOwner('not-a-uuid', receipt.id)).rejects.toThrow(
      'Owner ID must be a UUID.',
    );
    await expect(repository.create(ownerB, receipt)).rejects.toBeInstanceOf(
      HostedReceiptAlreadyExistsError,
    );
  });

  it('allows only one concurrent create for a globally unique receipt ID', async () => {
    const repository = new PostgresHostedReceiptRepository(requirePool());
    const receipt = makeReceipt();
    const results = await Promise.allSettled([
      repository.create(ownerA, receipt),
      repository.create(ownerA, receipt),
    ]);

    expect(results.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(({ status }) => status === 'rejected');
    expect(rejection).toMatchObject({ reason: expect.any(HostedReceiptAlreadyExistsError) });
  });

  it('rolls back a newly inserted merchant when receipt creation conflicts', async () => {
    const database = requirePool();
    const repository = new PostgresHostedReceiptRepository(database);
    const receipt = makeReceipt();
    await repository.create(ownerA, receipt);

    await expect(
      repository.create(
        ownerA,
        makeReceipt({
          merchantId: '20000000-0000-4000-8000-000000000099',
          merchantName: 'Rolled Back Merchant',
        }),
      ),
    ).rejects.toBeInstanceOf(HostedReceiptAlreadyExistsError);

    const merchant = await database.query<{ count: string }>(
      'SELECT count(*) FROM hosted_merchants WHERE id = $1;',
      ['20000000-0000-4000-8000-000000000099'],
    );
    expect(merchant.rows[0]?.count).toBe('0');
  });

  it('fails closed when a stored BIGINT exceeds JavaScript safe integers', async () => {
    const database = requirePool();
    const repository = new PostgresHostedReceiptRepository(database);
    const receipt = makeReceipt();
    await repository.create(ownerA, receipt);
    await database.query(
      `
        UPDATE hosted_receipts
        SET subtotal_minor = $1, tax_minor = 0, tip_minor = 0,
            discount_minor = 0, total_minor = $1
        WHERE owner_id = $2 AND id = $3;
      `,
      ['9007199254740992', ownerA, receipt.id],
    );

    await expect(repository.getByIdForOwner(ownerA, receipt.id)).rejects.toBeInstanceOf(
      ReceiptValidationError,
    );
  });
});
