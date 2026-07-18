// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createCategory, createManualReceipt, createTag } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';

import {
  SqliteCategoryRepository,
  SqliteReceiptClassificationRepository,
  SqliteTagRepository,
} from './classification-repository.js';
import {
  SqliteFieldEvidenceRepository,
  SqliteProcessingHistoryRepository,
} from './processing-repository.js';
import { SqliteReceiptDocumentRepository } from './receipt-document-repository.js';
import { SqliteReceiptRepository } from './receipt-repository.js';
import {
  migrateDatabase,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';
import { SqliteStructuredExportSnapshotRepository } from './structured-export-snapshot-repository.js';

describe('SQLite structured export snapshot repository', () => {
  it('reads every active export record in one transaction and excludes tombstoned data', async () => {
    const connection = new NodeSqliteConnection();
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const categories = new SqliteCategoryRepository(connection);
    const tags = new SqliteTagRepository(connection);
    const classifications = new SqliteReceiptClassificationRepository(connection);
    const documents = new SqliteReceiptDocumentRepository(connection);
    const evidence = new SqliteFieldEvidenceRepository(connection);
    const history = new SqliteProcessingHistoryRepository(connection);
    const timestamp = '2026-07-18T07:00:00-06:00';
    const category = await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Meals' }),
    );
    const tag = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Client visit' }),
    );
    const active = await receipts.create(makeReceipt('Active Market', timestamp));
    const classified = await classifications.update({
      categoryId: category.id,
      expectedVersion: active.version,
      receiptId: active.id,
      tagIds: [tag.id],
      updatedAt: '2026-07-18T07:01:00-06:00',
    });
    const activeDocument = await documents.create({
      byteSize: 4,
      createdAt: timestamp,
      heightPixels: 1,
      id: randomUUID(),
      isOriginal: true,
      mimeType: 'image/png',
      originalFilename: 'active.png',
      pageCount: 1,
      parentDocumentId: null,
      receiptId: active.id,
      sha256: 'a'.repeat(64),
      sourceType: 'image_import',
      storageDeletedAt: null,
      storageReference: `receipts/${active.id}/active.png`,
      widthPixels: 1,
    });
    const activeEvidence = await evidence.create({
      acceptedAt: null,
      boundingBox: null,
      confidence: 1,
      correctedAt: null,
      extractedValue: '1080',
      fieldName: 'total_minor',
      id: randomUUID(),
      normalizedValue: '1080',
      pageNumber: null,
      processedAt: timestamp,
      processorName: 'deterministic-parser',
      processorVersion: '1.0.0',
      receiptId: active.id,
      sourceType: 'deterministic_parser',
    });
    const activeHistory = await history.create({
      affectedFields: ['total_minor'],
      completedAt: '2026-07-18T07:00:01-06:00',
      executionLocation: 'local',
      failureCode: null,
      id: randomUUID(),
      modelVersion: null,
      processorName: 'deterministic-parser',
      processorVersion: '1.0.0',
      providerName: 'reimbursd-local',
      receiptId: active.id,
      reviewStatus: 'pending',
      startedAt: timestamp,
      status: 'succeeded',
    });
    const deleted = await receipts.create(makeReceipt('Deleted Market', timestamp));
    await documents.create({
      ...activeDocument,
      id: randomUUID(),
      receiptId: deleted.id,
      sha256: 'b'.repeat(64),
      storageReference: `receipts/${deleted.id}/deleted.png`,
    });
    await evidence.create({ ...activeEvidence, id: randomUUID(), receiptId: deleted.id });
    await history.create({ ...activeHistory, id: randomUUID(), receiptId: deleted.id });
    await receipts.delete(deleted.id, deleted.version, '2026-07-18T08:00:00-06:00');
    const deletedCategory = await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Unused' }),
    );
    await categories.delete(deletedCategory.id, deletedCategory.version, timestamp);
    connection.resetTransactionCount();

    const snapshot = await new SqliteStructuredExportSnapshotRepository(
      connection,
    ).getActiveSnapshot();

    expect(connection.transactionCount).toBe(1);
    expect(snapshot.receipts).toEqual([classified.receipt]);
    expect(snapshot.merchants).toEqual([
      expect.objectContaining({ displayName: 'Active Market', id: classified.receipt.merchantId }),
    ]);
    expect(snapshot.categories).toEqual([category]);
    expect(snapshot.tags).toEqual([tag]);
    expect(snapshot.receiptTags).toEqual([
      expect.objectContaining({ receiptId: active.id, tagId: tag.id }),
    ]);
    expect(snapshot.receiptDocuments).toEqual([activeDocument]);
    expect(snapshot.fieldEvidence).toEqual([activeEvidence]);
    expect(snapshot.processingHistory).toEqual([activeHistory]);
    expect(JSON.stringify(snapshot)).not.toContain('Deleted Market');
  });
});

class NodeSqliteConnection implements SqliteConnection {
  readonly #database = new DatabaseSync(':memory:');
  transactionCount = 0;

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

  resetTransactionCount(): void {
    this.transactionCount = 0;
  }

  async run(sql: string, parameters: readonly SqliteValue[] = []): Promise<SqliteRunResult> {
    const result = this.#database.prepare(sql).run(...toNodeValues(parameters));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.transactionCount += 1;
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

function makeReceipt(merchantName: string, timestamp: string) {
  return createManualReceipt({
    capturedAt: timestamp,
    currencyCode: 'USD',
    id: randomUUID(),
    merchantId: randomUUID(),
    merchantName,
    purchasedAt: timestamp,
    subtotalMinor: 1_000,
    taxMinor: 80,
    tipMinor: 0,
    totalMinor: 1_080,
  });
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
