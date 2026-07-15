// SPDX-License-Identifier: GPL-3.0-only
export type SqliteValue = number | string | null;

export interface SqliteRunResult {
  readonly changes: number;
  readonly lastInsertRowId: number;
}

export interface SqliteConnection {
  exec(sql: string): Promise<void>;
  getAll<Row>(sql: string, parameters?: readonly SqliteValue[]): Promise<readonly Row[]>;
  getFirst<Row>(sql: string, parameters?: readonly SqliteValue[]): Promise<Row | null>;
  run(sql: string, parameters?: readonly SqliteValue[]): Promise<SqliteRunResult>;
  transaction<Result>(operation: () => Promise<Result>): Promise<Result>;
}

interface Migration {
  readonly name: string;
  readonly sql: string;
  readonly version: number;
}

const migrations: readonly Migration[] = [
  {
    name: 'initial_local_receipts',
    sql: `
      CREATE TABLE merchants (
        id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
        normalized_name TEXT NOT NULL UNIQUE CHECK (length(normalized_name) BETWEEN 1 AND 200),
        website TEXT,
        phone TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE receipts (
        id TEXT PRIMARY KEY NOT NULL,
        merchant_id TEXT NOT NULL REFERENCES merchants(id),
        location_id TEXT,
        purchased_at TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        currency_code TEXT NOT NULL CHECK (currency_code IN ('AUD', 'CAD', 'EUR', 'GBP', 'JPY', 'USD')),
        subtotal_minor INTEGER NOT NULL CHECK (subtotal_minor >= 0),
        tax_minor INTEGER NOT NULL CHECK (tax_minor >= 0),
        tip_minor INTEGER NOT NULL CHECK (tip_minor >= 0),
        discount_minor INTEGER NOT NULL CHECK (discount_minor >= 0),
        total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
        category_id TEXT,
        source_type TEXT NOT NULL CHECK (source_type = 'manual'),
        notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 2000),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        version INTEGER NOT NULL CHECK (version >= 1),
        deleted_at TEXT,
        CHECK (total_minor = subtotal_minor + tax_minor + tip_minor - discount_minor)
      );

      CREATE INDEX receipts_active_purchase_idx
        ON receipts(deleted_at, purchased_at DESC, created_at DESC);
      CREATE INDEX receipts_active_currency_idx
        ON receipts(deleted_at, currency_code);
      CREATE INDEX receipts_merchant_idx ON receipts(merchant_id);
    `,
    version: 1,
  },
];

export const schemaVersion = migrations.at(-1)?.version ?? 0;

export async function migrateDatabase(connection: SqliteConnection): Promise<void> {
  await connection.exec('PRAGMA foreign_keys = ON;');
  await connection.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const applied = await connection.getAll<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version;',
  );
  const appliedVersions = new Set(applied.map(({ version }) => version));
  const futureVersion = applied.find(({ version }) => version > schemaVersion);

  if (futureVersion !== undefined) {
    throw new Error(
      `Database schema version ${futureVersion.version} is newer than supported version ${schemaVersion}.`,
    );
  }

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await connection.transaction(async () => {
      await connection.exec(migration.sql);
      await connection.run(
        'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?);',
        [migration.version, migration.name, new Date().toISOString()],
      );
    });
  }
}
