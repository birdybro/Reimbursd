// SPDX-License-Identifier: GPL-3.0-only
import type { Pool, PoolClient } from 'pg';

export interface HostedMigration {
  readonly name: string;
  readonly sql: string;
  readonly version: number;
}

export const hostedMigrations: readonly HostedMigration[] = [
  {
    name: 'owner_scoped_receipts',
    sql: `
      CREATE TABLE hosted_merchants (
        id UUID PRIMARY KEY,
        owner_id UUID NOT NULL,
        display_name VARCHAR(200) NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
        normalized_name VARCHAR(200) NOT NULL CHECK (length(normalized_name) BETWEEN 1 AND 200),
        created_at VARCHAR(35) NOT NULL CHECK (length(created_at) BETWEEN 20 AND 35),
        updated_at VARCHAR(35) NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 35),
        UNIQUE (owner_id, id)
      );

      CREATE INDEX hosted_merchants_owner_idx
        ON hosted_merchants(owner_id, normalized_name, id);

      CREATE TABLE hosted_receipts (
        id UUID PRIMARY KEY,
        owner_id UUID NOT NULL,
        merchant_id UUID NOT NULL,
        location_id UUID,
        purchased_at VARCHAR(35) NOT NULL CHECK (length(purchased_at) BETWEEN 20 AND 35),
        captured_at VARCHAR(35) NOT NULL CHECK (length(captured_at) BETWEEN 20 AND 35),
        currency_code VARCHAR(3) NOT NULL
          CHECK (currency_code IN ('AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'USD')),
        subtotal_minor BIGINT NOT NULL CHECK (subtotal_minor >= 0),
        tax_minor BIGINT NOT NULL CHECK (tax_minor >= 0),
        tip_minor BIGINT NOT NULL CHECK (tip_minor >= 0),
        discount_minor BIGINT NOT NULL CHECK (discount_minor >= 0),
        total_minor BIGINT NOT NULL CHECK (total_minor >= 0),
        category_id UUID,
        source_type VARCHAR(32) NOT NULL CHECK (source_type = 'manual'),
        notes VARCHAR(2000) NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
        created_at VARCHAR(35) NOT NULL CHECK (length(created_at) BETWEEN 20 AND 35),
        updated_at VARCHAR(35) NOT NULL CHECK (length(updated_at) BETWEEN 20 AND 35),
        version INTEGER NOT NULL CHECK (version >= 1),
        deleted_at VARCHAR(35) CHECK (deleted_at IS NULL OR length(deleted_at) BETWEEN 20 AND 35),
        UNIQUE (owner_id, id),
        FOREIGN KEY (owner_id, merchant_id)
          REFERENCES hosted_merchants(owner_id, id),
        CHECK (total_minor = subtotal_minor + tax_minor + tip_minor - discount_minor)
      );

      CREATE INDEX hosted_receipts_owner_active_idx
        ON hosted_receipts(owner_id, deleted_at, purchased_at DESC, created_at DESC, id);
      CREATE INDEX hosted_receipts_owner_merchant_idx
        ON hosted_receipts(owner_id, merchant_id, deleted_at);
    `,
    version: 1,
  },
];

export const hostedSchemaVersion = hostedMigrations.at(-1)?.version ?? 0;
const migrationLockId = 1_912_326_783;

export async function migrateHostedDatabase(
  pool: Pool,
  migrations: readonly HostedMigration[] = hostedMigrations,
): Promise<void> {
  assertOrderedMigrations(migrations);
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    await client.query('BEGIN;');
    transactionStarted = true;
    await client.query('SELECT pg_advisory_xact_lock($1);', [migrationLockId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS hosted_schema_migrations (
        version INTEGER PRIMARY KEY,
        name VARCHAR(128) NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL
      );
    `);

    const appliedResult = await client.query<{ name: string; version: number }>(
      'SELECT version, name FROM hosted_schema_migrations ORDER BY version;',
    );
    const supportedVersion = migrations.at(-1)?.version ?? 0;
    const futureVersion = appliedResult.rows.find(({ version }) => version > supportedVersion);

    if (futureVersion) {
      throw new Error(
        `Hosted database schema version ${futureVersion.version} is newer than supported version ${supportedVersion}.`,
      );
    }

    for (const [index, appliedMigration] of appliedResult.rows.entries()) {
      const expectedMigration = migrations[index];

      if (
        appliedMigration.version !== index + 1 ||
        expectedMigration?.version !== appliedMigration.version ||
        expectedMigration.name !== appliedMigration.name
      ) {
        throw new Error('Hosted database migration history does not match this application.');
      }
    }

    const appliedVersions = new Set(appliedResult.rows.map(({ version }) => version));

    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        continue;
      }

      await client.query(migration.sql);
      await client.query(
        `
          INSERT INTO hosted_schema_migrations (version, name, applied_at)
          VALUES ($1, $2, $3);
        `,
        [migration.version, migration.name, new Date()],
      );
    }

    await client.query('COMMIT;');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await rollbackOrThrow(client, error);
    }

    throw error;
  } finally {
    client.release();
  }
}

function assertOrderedMigrations(migrations: readonly HostedMigration[]): void {
  for (const [index, migration] of migrations.entries()) {
    if (
      migration.version !== index + 1 ||
      migration.name.length === 0 ||
      migration.name.length > 128
    ) {
      throw new Error('Hosted database migrations must use consecutive versions and names.');
    }
  }
}

async function rollbackOrThrow(client: PoolClient, originalError: unknown): Promise<void> {
  try {
    await client.query('ROLLBACK;');
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      'Hosted database migration and rollback both failed.',
    );
  }
}
