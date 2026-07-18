// SPDX-License-Identifier: GPL-3.0-only
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createCategory, createManualReceipt, createTag } from '@reimbursd/domain';
import {
  createStructuredExport,
  parseStructuredExport,
  type StructuredExportRecords,
} from '@reimbursd/export';
import { describe, expect, it } from 'vitest';

import {
  SqliteStructuredImportRepository,
  StructuredImportTargetNotEmptyError,
} from './structured-import-repository.js';
import { SqliteStructuredExportSnapshotRepository } from './structured-export-snapshot-repository.js';
import {
  migrateDatabase,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';

const createdAt = '2026-07-18T07:00:00-06:00';
const receiptId = '22222222-2222-4222-8222-222222222222';
const merchantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tagId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const documentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('SQLite structured import repository', () => {
  it('round-trips a complete archive into a clean database and refuses a merge', async () => {
    const connection = new NodeSqliteConnection();
    await migrateDatabase(connection);
    const records = populatedRecords();
    const attachmentBytes = Uint8Array.from([1, 2, 3, 4]);
    const hasher = { sha256: async () => 'a'.repeat(64) };
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [{ bytes: attachmentBytes, documentId }],
      createdAt,
      hasher,
      includeOriginalAttachments: true,
      records,
      schemaVersion: 6,
    });
    const parsed = await parseStructuredExport({
      bytes: archive.bytes,
      hasher,
      supportedSchemaVersion: 6,
    });
    const repository = new SqliteStructuredImportRepository(connection);

    expect(parsed.attachments).toEqual([{ bytes: attachmentBytes, documentId }]);
    await expect(repository.restoreClean(parsed.records)).resolves.toEqual({
      attachmentDocumentCount: 1,
      categoryCount: 1,
      evidenceCount: 1,
      processingHistoryCount: 1,
      receiptCount: 1,
      tagCount: 1,
    });
    await expect(
      new SqliteStructuredExportSnapshotRepository(connection).getActiveSnapshot(),
    ).resolves.toEqual(records);
    await expect(repository.restoreClean(parsed.records)).rejects.toBeInstanceOf(
      StructuredImportTargetNotEmptyError,
    );
  });

  it('rolls back every inserted table after a mid-restore database failure', async () => {
    const connection = new NodeSqliteConnection();
    await migrateDatabase(connection);
    const failing = new FailingRunConnection(connection, 'INSERT INTO processing_history');

    await expect(
      new SqliteStructuredImportRepository(failing).restoreClean(populatedRecords()),
    ).rejects.toThrow('synthetic restore write failure');
    await expect(
      new SqliteStructuredExportSnapshotRepository(connection).getActiveSnapshot(),
    ).resolves.toEqual(emptyRecords());
  });
});

class FailingRunConnection implements SqliteConnection {
  readonly #delegate: SqliteConnection;
  readonly #sqlFragment: string;

  constructor(delegate: SqliteConnection, sqlFragment: string) {
    this.#delegate = delegate;
    this.#sqlFragment = sqlFragment;
  }

  exec(sql: string): Promise<void> {
    return this.#delegate.exec(sql);
  }

  getAll<Row>(sql: string, parameters?: readonly SqliteValue[]): Promise<readonly Row[]> {
    return this.#delegate.getAll(sql, parameters);
  }

  getFirst<Row>(sql: string, parameters?: readonly SqliteValue[]): Promise<Row | null> {
    return this.#delegate.getFirst(sql, parameters);
  }

  run(sql: string, parameters?: readonly SqliteValue[]): Promise<SqliteRunResult> {
    if (sql.includes(this.#sqlFragment)) {
      throw new Error('synthetic restore write failure');
    }

    return this.#delegate.run(sql, parameters);
  }

  transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    return this.#delegate.transaction(operation);
  }
}

class NodeSqliteConnection implements SqliteConnection {
  readonly #database = new DatabaseSync(':memory:');

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

function populatedRecords(): StructuredExportRecords {
  const receipt = {
    ...createManualReceipt({
      capturedAt: createdAt,
      currencyCode: 'USD',
      id: receiptId,
      merchantId,
      merchantName: 'Corner Market',
      purchasedAt: '2026-07-17T12:00:00-06:00',
      subtotalMinor: 1_000,
      taxMinor: 80,
      tipMinor: 0,
      totalMinor: 1_080,
    }),
    categoryId,
  };

  return {
    categories: [createCategory({ createdAt, id: categoryId, name: 'Meals' })],
    fieldEvidence: [
      {
        acceptedAt: null,
        boundingBox: null,
        confidence: 1,
        correctedAt: createdAt,
        extractedValue: '10.80',
        fieldName: 'total_minor',
        id: '11111111-1111-4111-8111-111111111111',
        normalizedValue: '1080',
        pageNumber: null,
        processedAt: createdAt,
        processorName: 'reimbursd-user-review',
        processorVersion: '1.0.0',
        receiptId,
        sourceType: 'user_correction',
      },
    ],
    merchants: [
      {
        createdAt,
        displayName: 'Corner Market',
        id: merchantId,
        normalizedName: 'corner market',
        phone: null,
        updatedAt: createdAt,
        website: null,
      },
    ],
    processingHistory: [
      {
        affectedFields: ['total_minor'],
        completedAt: '2026-07-18T07:00:01-06:00',
        executionLocation: 'local',
        failureCode: null,
        id: '33333333-3333-4333-8333-333333333333',
        modelVersion: null,
        processorName: 'deterministic-receipt-parser',
        processorVersion: '1.0.0',
        providerName: 'reimbursd-local',
        receiptId,
        reviewStatus: 'corrected',
        startedAt: createdAt,
        status: 'succeeded',
      },
    ],
    receiptDocuments: [
      {
        byteSize: 4,
        createdAt,
        heightPixels: 1,
        id: documentId,
        isOriginal: true,
        mimeType: 'image/png',
        originalFilename: 'receipt.png',
        pageCount: 1,
        parentDocumentId: null,
        receiptId,
        sha256: 'a'.repeat(64),
        sourceType: 'image_import',
        storageDeletedAt: null,
        storageReference: `receipt-documents/${receiptId}/originals/${documentId}.png`,
        widthPixels: 1,
      },
    ],
    receiptTags: [
      {
        assignedAt: createdAt,
        deletedAt: null,
        receiptId,
        tagId,
        updatedAt: createdAt,
        version: 1,
      },
    ],
    receipts: [receipt],
    tags: [createTag({ createdAt, id: tagId, name: 'Client visit' })],
  };
}

function emptyRecords(): StructuredExportRecords {
  return {
    categories: [],
    fieldEvidence: [],
    merchants: [],
    processingHistory: [],
    receiptDocuments: [],
    receiptTags: [],
    receipts: [],
    tags: [],
  };
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
