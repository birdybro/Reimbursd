// SPDX-License-Identifier: GPL-3.0-only
import type { SqliteConnection } from './sqlite.js';

const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface LocalDataDeletionState {
  readonly requestedAt: string;
}

export interface LocalDataDeletionResult {
  readonly categoryCount: number;
  readonly documentCount: number;
  readonly evidenceCount: number;
  readonly merchantCount: number;
  readonly processingHistoryCount: number;
  readonly receiptCount: number;
  readonly receiptTagCount: number;
  readonly tagCount: number;
}

export interface LocalDataDeletionRepository {
  begin(requestedAt: string): Promise<LocalDataDeletionState>;
  finalize(): Promise<LocalDataDeletionResult>;
  getPending(): Promise<LocalDataDeletionState | null>;
}

export class LocalDataDeletionAttachmentsPendingError extends Error {
  constructor() {
    super('Local receipt files must be removed before structured data deletion can finish.');
    this.name = 'LocalDataDeletionAttachmentsPendingError';
  }
}

export class LocalDataDeletionNotPendingError extends Error {
  constructor() {
    super('No local data deletion is pending.');
    this.name = 'LocalDataDeletionNotPendingError';
  }
}

export class SqliteLocalDataDeletionRepository implements LocalDataDeletionRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async begin(requestedAt: string): Promise<LocalDataDeletionState> {
    assertOffsetDateTime(requestedAt);

    return this.#connection.transaction(async () => {
      const pending = await this.getPending();

      if (pending !== null) {
        return pending;
      }

      await this.#connection.run(
        'INSERT INTO local_data_deletion (singleton, requested_at) VALUES (1, ?);',
        [requestedAt],
      );
      await this.#connection.run(
        `UPDATE receipts
         SET deleted_at = ?, updated_at = ?, version = version + 1
         WHERE deleted_at IS NULL;`,
        [requestedAt, requestedAt],
      );

      return { requestedAt };
    });
  }

  async getPending(): Promise<LocalDataDeletionState | null> {
    const row = await this.#connection.getFirst<{ requested_at: string }>(
      'SELECT requested_at FROM local_data_deletion WHERE singleton = 1;',
    );

    if (row === null) {
      return null;
    }

    assertOffsetDateTime(row.requested_at);
    return { requestedAt: row.requested_at };
  }

  async finalize(): Promise<LocalDataDeletionResult> {
    return this.#connection.transaction(async () => {
      if ((await this.getPending()) === null) {
        throw new LocalDataDeletionNotPendingError();
      }

      const pendingDocuments = await this.#connection.getFirst<{ record_count: number }>(
        `SELECT COUNT(*) AS record_count
         FROM receipt_documents
         WHERE storage_deleted_at IS NULL;`,
      );

      if (pendingDocuments === null || pendingDocuments.record_count !== 0) {
        throw new LocalDataDeletionAttachmentsPendingError();
      }

      const counts = await this.#connection.getFirst<DeletionCountRow>(`
        SELECT
          (SELECT COUNT(*) FROM categories) AS category_count,
          (SELECT COUNT(*) FROM receipt_documents) AS document_count,
          (SELECT COUNT(*) FROM field_evidence) AS evidence_count,
          (SELECT COUNT(*) FROM merchants) AS merchant_count,
          (SELECT COUNT(*) FROM processing_history) AS processing_history_count,
          (SELECT COUNT(*) FROM receipts) AS receipt_count,
          (SELECT COUNT(*) FROM receipt_tags) AS receipt_tag_count,
          (SELECT COUNT(*) FROM tags) AS tag_count;
      `);

      if (counts === null) {
        throw new Error('Local data deletion counts could not be read.');
      }

      for (const table of [
        'field_evidence',
        'processing_history',
        'receipt_tags',
        'receipt_documents',
        'receipts',
        'categories',
        'tags',
        'merchants',
        'local_data_deletion',
      ]) {
        await this.#connection.run(`DELETE FROM ${table};`);
      }

      return mapDeletionCounts(counts);
    });
  }
}

interface DeletionCountRow {
  readonly category_count: number;
  readonly document_count: number;
  readonly evidence_count: number;
  readonly merchant_count: number;
  readonly processing_history_count: number;
  readonly receipt_count: number;
  readonly receipt_tag_count: number;
  readonly tag_count: number;
}

function mapDeletionCounts(row: DeletionCountRow): LocalDataDeletionResult {
  const values = Object.values(row);

  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('Local data deletion returned invalid record counts.');
  }

  return {
    categoryCount: row.category_count,
    documentCount: row.document_count,
    evidenceCount: row.evidence_count,
    merchantCount: row.merchant_count,
    processingHistoryCount: row.processing_history_count,
    receiptCount: row.receipt_count,
    receiptTagCount: row.receipt_tag_count,
    tagCount: row.tag_count,
  };
}

function assertOffsetDateTime(value: string): void {
  if (!offsetDateTimePattern.test(value) || Number.isNaN(Date.parse(value))) {
    throw new TypeError('Local data deletion time must be a valid timestamp with an offset.');
  }
}
