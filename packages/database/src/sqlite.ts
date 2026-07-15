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
  {
    name: 'receipt_document_metadata',
    sql: `
      CREATE TABLE receipt_documents (
        id TEXT PRIMARY KEY NOT NULL,
        receipt_id TEXT NOT NULL REFERENCES receipts(id),
        parent_document_id TEXT REFERENCES receipt_documents(id),
        storage_reference TEXT NOT NULL UNIQUE
          CHECK (length(storage_reference) BETWEEN 1 AND 1024),
        original_filename TEXT NOT NULL
          CHECK (length(original_filename) BETWEEN 1 AND 255),
        mime_type TEXT NOT NULL
          CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png')),
        byte_size INTEGER NOT NULL CHECK (byte_size > 0),
        sha256 TEXT NOT NULL
          CHECK (length(sha256) = 64 AND sha256 = lower(sha256)),
        page_count INTEGER NOT NULL CHECK (page_count > 0),
        width_pixels INTEGER CHECK (width_pixels > 0),
        height_pixels INTEGER CHECK (height_pixels > 0),
        is_original INTEGER NOT NULL CHECK (is_original IN (0, 1)),
        created_at TEXT NOT NULL,
        CHECK (
          (mime_type = 'application/pdf' AND width_pixels IS NULL AND height_pixels IS NULL)
          OR
          (mime_type != 'application/pdf' AND page_count = 1
            AND width_pixels IS NOT NULL AND height_pixels IS NOT NULL)
        ),
        CHECK (
          (is_original = 1 AND parent_document_id IS NULL)
          OR (is_original = 0 AND parent_document_id IS NOT NULL)
        )
      );

      CREATE INDEX receipt_documents_receipt_idx
        ON receipt_documents(receipt_id, is_original DESC, created_at, id);
      CREATE INDEX receipt_documents_sha256_idx ON receipt_documents(sha256);
      CREATE UNIQUE INDEX receipt_documents_original_receipt_hash_idx
        ON receipt_documents(receipt_id, sha256) WHERE is_original = 1;
    `,
    version: 2,
  },
  {
    name: 'receipt_document_sources',
    sql: `
      ALTER TABLE receipt_documents
      ADD COLUMN source_type TEXT NOT NULL DEFAULT 'image_import'
        CHECK (source_type IN ('camera', 'image_import', 'pdf_import', 'derivative'));
    `,
    version: 3,
  },
  {
    name: 'receipt_document_storage_deletion',
    sql: `
      ALTER TABLE receipt_documents ADD COLUMN storage_deleted_at TEXT;
      CREATE INDEX receipt_documents_storage_deletion_idx
        ON receipt_documents(storage_deleted_at, receipt_id);
    `,
    version: 4,
  },
  {
    name: 'local_processing_provenance',
    sql: `
      CREATE TABLE field_evidence (
        id TEXT PRIMARY KEY NOT NULL,
        receipt_id TEXT NOT NULL REFERENCES receipts(id),
        field_name TEXT NOT NULL CHECK (field_name IN (
          'merchant_name', 'purchased_at', 'currency_code', 'subtotal_minor',
          'tax_minor', 'tip_minor', 'discount_minor', 'total_minor'
        )),
        extracted_value TEXT NOT NULL CHECK (length(extracted_value) BETWEEN 1 AND 4096),
        normalized_value TEXT NOT NULL CHECK (length(normalized_value) BETWEEN 1 AND 4096),
        source_type TEXT NOT NULL CHECK (source_type IN (
          'manual', 'local_ocr', 'deterministic_parser', 'hosted_ocr', 'hosted_ai',
          'imported_structured_data', 'user_correction'
        )),
        processor_name TEXT NOT NULL CHECK (length(processor_name) BETWEEN 1 AND 128),
        processor_version TEXT NOT NULL CHECK (length(processor_version) BETWEEN 1 AND 128),
        confidence REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
        page_number INTEGER CHECK (page_number > 0),
        bounding_box_x REAL,
        bounding_box_y REAL,
        bounding_box_width REAL,
        bounding_box_height REAL,
        processed_at TEXT NOT NULL,
        accepted_at TEXT,
        corrected_at TEXT,
        CHECK (
          (bounding_box_x IS NULL AND bounding_box_y IS NULL
            AND bounding_box_width IS NULL AND bounding_box_height IS NULL)
          OR
          (page_number IS NOT NULL
            AND bounding_box_x >= 0 AND bounding_box_y >= 0
            AND bounding_box_width > 0 AND bounding_box_height > 0
            AND bounding_box_x + bounding_box_width <= 1
            AND bounding_box_y + bounding_box_height <= 1)
        )
      );

      CREATE INDEX field_evidence_receipt_field_idx
        ON field_evidence(receipt_id, field_name, processed_at DESC, id);

      CREATE TABLE processing_history (
        id TEXT PRIMARY KEY NOT NULL,
        receipt_id TEXT NOT NULL REFERENCES receipts(id),
        processor_name TEXT NOT NULL CHECK (length(processor_name) BETWEEN 1 AND 128),
        processor_version TEXT NOT NULL CHECK (length(processor_version) BETWEEN 1 AND 128),
        execution_location TEXT NOT NULL CHECK (execution_location IN ('local', 'remote')),
        provider_name TEXT NOT NULL CHECK (length(provider_name) BETWEEN 1 AND 128),
        model_version TEXT CHECK (length(model_version) BETWEEN 1 AND 128),
        started_at TEXT NOT NULL,
        completed_at TEXT,
        status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed', 'cancelled')),
        failure_code TEXT CHECK (length(failure_code) BETWEEN 1 AND 128),
        affected_fields_json TEXT NOT NULL CHECK (length(affected_fields_json) BETWEEN 2 AND 1024),
        review_status TEXT NOT NULL CHECK (
          review_status IN ('not_applicable', 'pending', 'accepted', 'corrected')
        ),
        CHECK ((status = 'running') = (completed_at IS NULL)),
        CHECK ((status = 'failed') = (failure_code IS NOT NULL))
      );

      CREATE INDEX processing_history_receipt_started_idx
        ON processing_history(receipt_id, started_at DESC, id);
    `,
    version: 5,
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
