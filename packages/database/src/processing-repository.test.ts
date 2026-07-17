// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import {
  createManualReceipt,
  type FieldEvidence,
  type ProcessingHistory,
  type Receipt,
} from '@reimbursd/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ProcessingHistoryConflictError,
  ProcessingReceiptNotFoundError,
  SqliteFieldEvidenceRepository,
  SqliteProcessingHistoryRepository,
} from './processing-repository.js';
import {
  SqliteReceiptRepository,
  SqliteReceiptReviewRepository,
  type UpdateReceiptInput,
} from './receipt-repository.js';
import {
  migrateDatabase,
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

describe('SQLite processing provenance repositories', () => {
  it('persists field evidence and preserves accepted authority after reopening', async () => {
    const path = createTemporaryDatabasePath();
    const firstConnection = new NodeSqliteConnection(path);
    await migrateDatabase(firstConnection);
    const receipts = new SqliteReceiptRepository(firstConnection);
    const receipt = makeReceipt();
    await receipts.create(receipt);
    const repository = new SqliteFieldEvidenceRepository(firstConnection);
    const accepted = makeEvidence(receipt.id, {
      acceptedAt: '2026-07-15T06:01:00.000Z',
    });
    const laterAutomation = makeEvidence(receipt.id, {
      id: randomUUID(),
      processedAt: '2026-07-15T06:02:00.000Z',
    });

    await repository.create(accepted);
    await repository.create(laterAutomation);
    firstConnection.close();

    const reopenedConnection = new NodeSqliteConnection(path);
    await migrateDatabase(reopenedConnection);
    const reopened = new SqliteFieldEvidenceRepository(reopenedConnection);

    await expect(reopened.listByReceiptId(receipt.id)).resolves.toEqual([
      accepted,
      laterAutomation,
    ]);
    await expect(reopened.getPreferred(receipt.id, 'total_minor')).resolves.toEqual(accepted);
    reopenedConnection.close();
  });

  it('records a running attempt and completes it exactly once', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = makeReceipt();
    await receipts.create(receipt);
    const repository = new SqliteProcessingHistoryRepository(connection);
    const running = makeHistory(receipt.id);

    await repository.create(running);
    const completed = await repository.complete({
      affectedFields: ['merchant_name', 'total_minor'],
      completedAt: '2026-07-15T06:00:01.000Z',
      failureCode: null,
      id: running.id,
      reviewStatus: 'pending',
      status: 'succeeded',
    });

    expect(completed).toMatchObject({
      affectedFields: ['merchant_name', 'total_minor'],
      reviewStatus: 'pending',
      status: 'succeeded',
    });
    await expect(
      repository.complete({
        affectedFields: [],
        completedAt: '2026-07-15T06:00:02.000Z',
        failureCode: 'provider_unavailable',
        id: running.id,
        reviewStatus: 'not_applicable',
        status: 'failed',
      }),
    ).rejects.toBeInstanceOf(ProcessingHistoryConflictError);
    await expect(repository.listByReceiptId(receipt.id)).resolves.toEqual([completed]);
    connection.close();
  });

  it('creates a candidate set atomically', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = makeReceipt();
    await receipts.create(receipt);
    const repository = new SqliteFieldEvidenceRepository(connection);
    const total = makeEvidence(receipt.id);
    const tax = makeEvidence(receipt.id, {
      fieldName: 'tax_minor',
      id: randomUUID(),
      normalizedValue: '100',
    });

    await expect(repository.createMany([tax, total])).resolves.toEqual([tax, total]);
    const persisted = await repository.listByReceiptId(receipt.id);
    expect(persisted).toHaveLength(2);
    expect(persisted).toEqual(expect.arrayContaining([tax, total]));
    connection.close();
  });

  it('rolls back every candidate when a batch insert fails', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = makeReceipt();
    await receipts.create(receipt);
    const repository = new SqliteFieldEvidenceRepository(connection);
    const duplicate = makeEvidence(receipt.id);

    await expect(repository.createMany([duplicate, duplicate])).rejects.toThrow();
    await expect(repository.listByReceiptId(receipt.id)).resolves.toEqual([]);
    connection.close();
  });

  it('rejects new provenance after its receipt is tombstoned', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = makeReceipt();
    await receipts.create(receipt);
    await receipts.delete(receipt.id, receipt.version, '2026-07-15T06:03:00.000Z');

    await expect(
      new SqliteFieldEvidenceRepository(connection).create(makeEvidence(receipt.id)),
    ).rejects.toBeInstanceOf(ProcessingReceiptNotFoundError);
    await expect(
      new SqliteProcessingHistoryRepository(connection).create(makeHistory(receipt.id)),
    ).rejects.toBeInstanceOf(ProcessingReceiptNotFoundError);
    connection.close();
  });

  it('atomically accepts suggestions and closes pending processing review', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipt = await new SqliteReceiptRepository(connection).create(makeReceipt());
    const evidenceRepository = new SqliteFieldEvidenceRepository(connection);
    const suggestions = [
      makeEvidence(receipt.id, {
        extractedValue: 'Corner Market',
        fieldName: 'merchant_name',
        normalizedValue: 'Corner Market',
      }),
      makeEvidence(receipt.id, {
        fieldName: 'subtotal_minor',
        id: randomUUID(),
        normalizedValue: '1000',
      }),
      makeEvidence(receipt.id, {
        fieldName: 'tax_minor',
        id: randomUUID(),
        normalizedValue: '80',
      }),
      makeEvidence(receipt.id, { id: randomUUID(), normalizedValue: '1080' }),
    ];
    await evidenceRepository.createMany(suggestions);
    const historyRepository = new SqliteProcessingHistoryRepository(connection);
    const running = makeHistory(receipt.id);
    await historyRepository.create(running);
    await historyRepository.complete({
      affectedFields: suggestions.map(({ fieldName }) => fieldName),
      completedAt: '2026-07-15T06:00:01.000Z',
      failureCode: null,
      id: running.id,
      reviewStatus: 'pending',
      status: 'succeeded',
    });
    const reviewedAt = '2026-07-15T06:05:00.000Z';

    const reviewed = await new SqliteReceiptReviewRepository(connection).review({
      corrections: [],
      evidenceReviews: suggestions.map(({ id }) => ({
        evidenceId: id,
        reviewedAt,
        status: 'accepted',
      })),
      processingHistoryIds: [running.id],
      update: makeReviewUpdate(receipt, {
        merchantId: randomUUID(),
        merchantName: 'Corner Market',
        subtotalMinor: 1_000,
        taxMinor: 80,
        totalMinor: 1_080,
        updatedAt: reviewedAt,
      }),
    });

    expect(reviewed).toMatchObject({
      merchantName: 'Corner Market',
      subtotalMinor: 1_000,
      taxMinor: 80,
      totalMinor: 1_080,
      version: 2,
    });
    expect(await evidenceRepository.listByReceiptId(receipt.id)).toEqual(
      expect.arrayContaining(suggestions.map((item) => ({ ...item, acceptedAt: reviewedAt }))),
    );
    await expect(historyRepository.getById(running.id)).resolves.toMatchObject({
      reviewStatus: 'accepted',
    });
    connection.close();
  });

  it('preserves corrected suggestions as authoritative user evidence', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipt = await new SqliteReceiptRepository(connection).create(makeReceipt());
    const evidenceRepository = new SqliteFieldEvidenceRepository(connection);
    const subtotal = makeEvidence(receipt.id, {
      fieldName: 'subtotal_minor',
      normalizedValue: '1000',
    });
    const total = makeEvidence(receipt.id, { id: randomUUID(), normalizedValue: '1080' });
    await evidenceRepository.createMany([subtotal, total]);
    const historyRepository = new SqliteProcessingHistoryRepository(connection);
    const running = makeHistory(receipt.id);
    await historyRepository.create(running);
    await historyRepository.complete({
      affectedFields: ['subtotal_minor', 'total_minor'],
      completedAt: '2026-07-15T06:00:01.000Z',
      failureCode: null,
      id: running.id,
      reviewStatus: 'pending',
      status: 'succeeded',
    });
    const reviewedAt = '2026-07-15T06:05:00.000Z';
    const taxCorrection = makeCorrection(receipt.id, 'tax_minor', '100', reviewedAt);
    const totalCorrection = makeCorrection(receipt.id, 'total_minor', '1100', reviewedAt);

    await new SqliteReceiptReviewRepository(connection).review({
      corrections: [taxCorrection, totalCorrection],
      evidenceReviews: [
        { evidenceId: subtotal.id, reviewedAt, status: 'accepted' },
        { evidenceId: total.id, reviewedAt, status: 'corrected' },
      ],
      processingHistoryIds: [running.id],
      update: makeReviewUpdate(receipt, {
        subtotalMinor: 1_000,
        taxMinor: 100,
        totalMinor: 1_100,
        updatedAt: reviewedAt,
      }),
    });

    await expect(evidenceRepository.getPreferred(receipt.id, 'total_minor')).resolves.toEqual(
      totalCorrection,
    );
    await expect(historyRepository.getById(running.id)).resolves.toMatchObject({
      reviewStatus: 'corrected',
    });
    connection.close();
  });

  it('rolls back receipt and review markers when correction persistence fails', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = await receipts.create(makeReceipt());
    const evidenceRepository = new SqliteFieldEvidenceRepository(connection);
    const total = makeEvidence(receipt.id, { normalizedValue: '100' });
    await evidenceRepository.create(total);
    const reviewedAt = '2026-07-15T06:05:00.000Z';
    const duplicateCorrection = makeCorrection(
      receipt.id,
      'tax_minor',
      '100',
      reviewedAt,
      total.id,
    );

    await expect(
      new SqliteReceiptReviewRepository(connection).review({
        corrections: [duplicateCorrection],
        evidenceReviews: [{ evidenceId: total.id, reviewedAt, status: 'accepted' }],
        processingHistoryIds: [],
        update: makeReviewUpdate(receipt, {
          taxMinor: 100,
          totalMinor: 100,
          updatedAt: reviewedAt,
        }),
      }),
    ).rejects.toThrow();

    await expect(receipts.getById(receipt.id)).resolves.toEqual(receipt);
    await expect(evidenceRepository.getPreferred(receipt.id, 'total_minor')).resolves.toEqual(
      total,
    );
    connection.close();
  });
});

class NodeSqliteConnection implements SqliteConnection {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(path);
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
  const path = join(tmpdir(), `reimbursd-processing-${randomUUID()}.sqlite`);
  temporaryDatabases.push(path);
  return path;
}

function makeReceipt(): Receipt {
  return createManualReceipt({
    capturedAt: '2026-07-15T05:59:00.000Z',
    currencyCode: 'USD',
    id: randomUUID(),
    merchantId: randomUUID(),
    merchantName: 'Receipt to review',
    purchasedAt: '2026-07-15T05:59:00.000Z',
    subtotalMinor: 0,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor: 0,
  });
}

function makeEvidence(receiptId: string, overrides: Partial<FieldEvidence> = {}): FieldEvidence {
  return {
    acceptedAt: null,
    boundingBox: { height: 0.04, width: 0.18, x: 0.7, y: 0.82 },
    confidence: 0.94,
    correctedAt: null,
    extractedValue: '$13.34',
    fieldName: 'total_minor',
    id: randomUUID(),
    normalizedValue: '1334',
    pageNumber: 1,
    processedAt: '2026-07-15T06:00:00.000Z',
    processorName: 'deterministic-receipt-parser',
    processorVersion: '1.0.0',
    receiptId,
    sourceType: 'deterministic_parser',
    ...overrides,
  };
}

function makeHistory(receiptId: string): ProcessingHistory {
  return {
    affectedFields: [],
    completedAt: null,
    executionLocation: 'local',
    failureCode: null,
    id: randomUUID(),
    modelVersion: null,
    processorName: 'reimbursd-deterministic-ocr',
    processorVersion: '1.0.0',
    providerName: 'reimbursd-local',
    receiptId,
    reviewStatus: 'not_applicable',
    startedAt: '2026-07-15T06:00:00.000Z',
    status: 'running',
  };
}

function makeCorrection(
  receiptId: string,
  fieldName: FieldEvidence['fieldName'],
  normalizedValue: string,
  reviewedAt: string,
  id: string = randomUUID(),
): FieldEvidence {
  return {
    acceptedAt: null,
    boundingBox: null,
    confidence: 1,
    correctedAt: reviewedAt,
    extractedValue: normalizedValue,
    fieldName,
    id,
    normalizedValue,
    pageNumber: null,
    processedAt: reviewedAt,
    processorName: 'reimbursd-user-review',
    processorVersion: '1.0.0',
    receiptId,
    sourceType: 'user_correction',
  };
}

function makeReviewUpdate(
  receipt: Receipt,
  overrides: Partial<UpdateReceiptInput>,
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
    updatedAt: '2026-07-15T06:05:00.000Z',
    ...overrides,
  };
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
