// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createManualReceipt, type Receipt } from '@reimbursd/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ReceiptConflictError,
  SqliteReceiptRepository,
  type UpdateReceiptInput,
} from './receipt-repository.js';
import {
  migrateDatabase,
  schemaVersion,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';

const temporaryDatabases: string[] = [];

afterEach(() => {
  for (const path of temporaryDatabases.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe('SQLite receipt repository', () => {
  it('runs migrations idempotently', async () => {
    const connection = new NodeSqliteConnection(':memory:');

    await migrateDatabase(connection);
    await migrateDatabase(connection);

    const versions = await connection.getAll<{ version: number }>(
      'SELECT version FROM schema_migrations;',
    );
    expect(versions).toEqual([{ version: schemaVersion }]);
    connection.close();
  });

  it('rolls back schema changes when migration recording fails', async () => {
    const connection = new NodeSqliteConnection(':memory:', true);

    await expect(migrateDatabase(connection)).rejects.toThrow('Synthetic migration record failure');

    const merchants = await connection.getFirst<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'merchants';",
    );
    expect(merchants).toBeNull();
    connection.close();
  });

  it('rejects databases created by a newer application schema', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await connection.exec(`
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );
      INSERT INTO schema_migrations (version, name, applied_at)
      VALUES (999, 'future', '2026-07-15T00:00:00.000Z');
    `);

    await expect(migrateDatabase(connection)).rejects.toThrow(
      'Database schema version 999 is newer than supported version 1.',
    );
    connection.close();
  });

  it('persists a receipt after the database is reopened', async () => {
    const path = createTemporaryDatabasePath();
    const firstConnection = new NodeSqliteConnection(path);
    await migrateDatabase(firstConnection);
    const firstRepository = new SqliteReceiptRepository(firstConnection);
    const receipt = makeReceipt({ merchantName: 'Corner Market' });

    await firstRepository.create(receipt);
    firstConnection.close();

    const reopenedConnection = new NodeSqliteConnection(path);
    await migrateDatabase(reopenedConnection);
    const reopenedRepository = new SqliteReceiptRepository(reopenedConnection);

    await expect(reopenedRepository.getById(receipt.id)).resolves.toMatchObject({
      id: receipt.id,
      merchantName: 'Corner Market',
      totalMinor: 1_280,
      version: 1,
    });
    reopenedConnection.close();
  });

  it('searches merchant names literally and filters by currency', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const repository = new SqliteReceiptRepository(connection);
    await repository.create(
      makeReceipt({ currencyCode: 'USD', merchantName: '100% Local Market' }),
    );
    await repository.create(makeReceipt({ currencyCode: 'CAD', merchantName: 'North Market' }));

    await expect(repository.list({ search: '100%' })).resolves.toHaveLength(1);
    await expect(repository.list({ currencyCode: 'CAD', search: 'market' })).resolves.toMatchObject(
      [{ currencyCode: 'CAD', merchantName: 'North Market' }],
    );
    await expect(repository.list({ search: '_' })).resolves.toEqual([]);
    connection.close();
  });

  it('updates with optimistic versions and rejects stale writes', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const repository = new SqliteReceiptRepository(connection);
    const receipt = await repository.create(makeReceipt());
    const update = makeUpdate(receipt, {
      merchantId: randomUUID(),
      merchantName: 'Updated Market',
    });

    const updated = await repository.update(update);

    expect(updated).toMatchObject({ merchantName: 'Updated Market', version: 2 });
    await expect(repository.update(update)).rejects.toBeInstanceOf(ReceiptConflictError);
    connection.close();
  });

  it('keeps a tombstone while hiding deleted receipts from active queries', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const repository = new SqliteReceiptRepository(connection);
    const receipt = await repository.create(makeReceipt());
    const deletedAt = '2026-07-14T19:00:00.000Z';

    const deleted = await repository.delete(receipt.id, receipt.version, deletedAt);

    expect(deleted).toMatchObject({ deletedAt, version: 2 });
    await expect(repository.getById(receipt.id)).resolves.toBeNull();
    await expect(repository.list()).resolves.toEqual([]);
    const row = await connection.getFirst<{ deleted_at: string; version: number }>(
      'SELECT deleted_at, version FROM receipts WHERE id = ?;',
      [receipt.id],
    );
    expect(row).toEqual({ deleted_at: deletedAt, version: 2 });
    connection.close();
  });

  it('rolls back merchant creation when receipt insertion fails', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const repository = new SqliteReceiptRepository(connection);
    const receipt = await repository.create(makeReceipt({ merchantName: 'First Merchant' }));
    const duplicateId = makeReceipt({ id: receipt.id, merchantName: 'Rolled Back Merchant' });

    await expect(repository.create(duplicateId)).rejects.toThrow();
    const merchant = await connection.getFirst<{ id: string }>(
      'SELECT id FROM merchants WHERE normalized_name = ?;',
      ['rolled back merchant'],
    );
    expect(merchant).toBeNull();
    connection.close();
  });
});

class NodeSqliteConnection implements SqliteConnection {
  readonly #database: DatabaseSync;
  readonly #failMigrationRecord: boolean;

  constructor(path: string, failMigrationRecord = false) {
    this.#database = new DatabaseSync(path);
    this.#failMigrationRecord = failMigrationRecord;
  }

  close(): void {
    this.#database.close();
  }

  async exec(sql: string): Promise<void> {
    this.#database.exec(sql);
  }

  async getAll<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...toNodeValues(parameters)) as Row[];
  }

  async getFirst<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<Row | null> {
    const row = this.#database.prepare(sql).get(...toNodeValues(parameters));
    return row === undefined ? null : (row as Row);
  }

  async run(sql: string, parameters: readonly SqliteValue[] = []): Promise<SqliteRunResult> {
    if (this.#failMigrationRecord && sql.includes('INSERT INTO schema_migrations')) {
      throw new Error('Synthetic migration record failure.');
    }

    const result = this.#database.prepare(sql).run(...toNodeValues(parameters));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.#database.exec('BEGIN IMMEDIATE;');

    try {
      const result = await operation();
      this.#database.exec('COMMIT;');
      return result;
    } catch (error) {
      this.#database.exec('ROLLBACK;');
      throw error;
    }
  }
}

function createTemporaryDatabasePath(): string {
  const path = join(tmpdir(), `reimbursd-${randomUUID()}.sqlite`);
  temporaryDatabases.push(path);
  return path;
}

function makeReceipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    ...createManualReceipt({
      capturedAt: '2026-07-14T18:30:00.000Z',
      currencyCode: 'USD',
      id: randomUUID(),
      merchantId: randomUUID(),
      merchantName: 'Corner Market',
      purchasedAt: '2026-07-14T12:00:00-06:00',
      subtotalMinor: 1_000,
      taxMinor: 80,
      tipMinor: 200,
      totalMinor: 1_280,
    }),
    ...overrides,
  };
}

function makeUpdate(
  receipt: Receipt,
  overrides: Partial<UpdateReceiptInput> = {},
): UpdateReceiptInput {
  return {
    currencyCode: receipt.currencyCode,
    discountMinor: receipt.discountMinor,
    expectedVersion: receipt.version,
    id: receipt.id,
    merchantId: receipt.merchantId,
    merchantName: receipt.merchantName,
    notes: receipt.notes,
    purchasedAt: receipt.purchasedAt,
    subtotalMinor: receipt.subtotalMinor,
    taxMinor: receipt.taxMinor,
    tipMinor: receipt.tipMinor,
    totalMinor: receipt.totalMinor,
    updatedAt: '2026-07-14T18:45:00.000Z',
    ...overrides,
  };
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
