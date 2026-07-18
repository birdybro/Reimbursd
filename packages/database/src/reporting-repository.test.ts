// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createCategory, createManualReceipt } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';

import {
  SqliteCategoryRepository,
  SqliteReceiptClassificationRepository,
} from './classification-repository.js';
import { SqliteReceiptRepository } from './receipt-repository.js';
import { SqliteExpenseReportRepository } from './reporting-repository.js';
import {
  migrateDatabase,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';

describe('SQLite expense report repository', () => {
  it('returns empty totals when there are no active receipts', async () => {
    const connection = new NodeSqliteConnection();
    await migrateDatabase(connection);

    await expect(new SqliteExpenseReportRepository(connection).getTotals()).resolves.toEqual({
      categoryTotals: [],
      monthlyTotals: [],
    });
    connection.close();
  });

  it('keeps currencies separate and excludes deleted receipts from monthly and category totals', async () => {
    const connection = new NodeSqliteConnection();
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const categories = new SqliteCategoryRepository(connection);
    const classifications = new SqliteReceiptClassificationRepository(connection);
    const travel = await categories.create(
      createCategory({
        createdAt: '2026-06-01T10:00:00-06:00',
        id: randomUUID(),
        name: 'Travel',
      }),
    );
    const meals = await categories.create(
      createCategory({
        createdAt: '2026-06-01T10:00:00-06:00',
        id: randomUUID(),
        name: 'Meals',
      }),
    );
    const julyUsdTravel = await receipts.create(makeReceipt('2026-07-12', 'USD', 1_200));
    await classifications.update({
      categoryId: travel.id,
      expectedVersion: julyUsdTravel.version,
      receiptId: julyUsdTravel.id,
      tagIds: [],
      updatedAt: '2026-07-12T13:00:00-06:00',
    });
    await receipts.create(makeReceipt('2026-07-18', 'USD', 300));
    const julyCadTravel = await receipts.create(makeReceipt('2026-07-20', 'CAD', 800));
    await classifications.update({
      categoryId: travel.id,
      expectedVersion: julyCadTravel.version,
      receiptId: julyCadTravel.id,
      tagIds: [],
      updatedAt: '2026-07-20T13:00:00-06:00',
    });
    const juneUsdMeals = await receipts.create(makeReceipt('2026-06-02', 'USD', 500));
    await classifications.update({
      categoryId: meals.id,
      expectedVersion: juneUsdMeals.version,
      receiptId: juneUsdMeals.id,
      tagIds: [],
      updatedAt: '2026-06-02T13:00:00-06:00',
    });
    const deleted = await receipts.create(makeReceipt('2026-07-25', 'USD', 9_999));
    await receipts.delete(deleted.id, deleted.version, '2026-07-25T14:00:00-06:00');

    const totals = await new SqliteExpenseReportRepository(connection).getTotals();

    expect(totals.monthlyTotals).toEqual([
      { currencyCode: 'CAD', month: '2026-07', receiptCount: 1, totalMinor: 800 },
      { currencyCode: 'USD', month: '2026-07', receiptCount: 2, totalMinor: 1_500 },
      { currencyCode: 'USD', month: '2026-06', receiptCount: 1, totalMinor: 500 },
    ]);
    expect(totals.categoryTotals).toEqual([
      { category: travel, currencyCode: 'CAD', receiptCount: 1, totalMinor: 800 },
      { category: travel, currencyCode: 'USD', receiptCount: 1, totalMinor: 1_200 },
      { category: meals, currencyCode: 'USD', receiptCount: 1, totalMinor: 500 },
      { category: null, currencyCode: 'USD', receiptCount: 1, totalMinor: 300 },
    ]);
    connection.close();
  });
});

class NodeSqliteConnection implements SqliteConnection {
  readonly #database = new DatabaseSync(':memory:');

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

function makeReceipt(purchaseDate: string, currencyCode: 'CAD' | 'USD', totalMinor: number) {
  const timestamp = `${purchaseDate}T12:00:00-06:00`;
  return createManualReceipt({
    capturedAt: timestamp,
    currencyCode,
    id: randomUUID(),
    merchantId: randomUUID(),
    merchantName: `Synthetic ${purchaseDate} ${currencyCode}`,
    purchasedAt: timestamp,
    subtotalMinor: totalMinor,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor,
  });
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
