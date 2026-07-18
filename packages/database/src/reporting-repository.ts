// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidCategory,
  isSupportedCurrencyCode,
  type Category,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

import type { SqliteConnection } from './sqlite.js';

export interface MonthlyExpenseTotal {
  readonly currencyCode: SupportedCurrencyCode;
  readonly month: string;
  readonly receiptCount: number;
  readonly totalMinor: number;
}

export interface CategoryExpenseTotal {
  readonly category: Category | null;
  readonly currencyCode: SupportedCurrencyCode;
  readonly receiptCount: number;
  readonly totalMinor: number;
}

export interface ExpenseTotals {
  readonly categoryTotals: readonly CategoryExpenseTotal[];
  readonly monthlyTotals: readonly MonthlyExpenseTotal[];
}

export interface ExpenseReportRepository {
  getTotals(): Promise<ExpenseTotals>;
}

interface MonthlyTotalRow {
  currency_code: string;
  purchase_month: string;
  receipt_count: number;
  total_minor: number;
}

interface CategoryTotalRow {
  category_created_at: string | null;
  category_deleted_at: string | null;
  category_id: string | null;
  category_name: string | null;
  category_normalized_name: string | null;
  category_updated_at: string | null;
  category_version: number | null;
  currency_code: string;
  receipt_count: number;
  total_minor: number;
}

export class SqliteExpenseReportRepository implements ExpenseReportRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async getTotals(): Promise<ExpenseTotals> {
    return this.#connection.transaction(async () => {
      const monthlyRows = await this.#connection.getAll<MonthlyTotalRow>(`
        SELECT
          substr(purchased_at, 1, 7) AS purchase_month,
          currency_code,
          COUNT(*) AS receipt_count,
          SUM(total_minor) AS total_minor
        FROM receipts
        WHERE deleted_at IS NULL
        GROUP BY substr(purchased_at, 1, 7), currency_code
        ORDER BY purchase_month DESC, currency_code ASC;
      `);
      const categoryRows = await this.#connection.getAll<CategoryTotalRow>(`
        SELECT
          r.category_id,
          c.name AS category_name,
          c.normalized_name AS category_normalized_name,
          c.created_at AS category_created_at,
          c.updated_at AS category_updated_at,
          c.version AS category_version,
          c.deleted_at AS category_deleted_at,
          r.currency_code,
          COUNT(*) AS receipt_count,
          SUM(r.total_minor) AS total_minor
        FROM receipts r
        LEFT JOIN categories c ON c.id = r.category_id AND c.deleted_at IS NULL
        WHERE r.deleted_at IS NULL
        GROUP BY
          r.category_id,
          c.name,
          c.normalized_name,
          c.created_at,
          c.updated_at,
          c.version,
          c.deleted_at,
          r.currency_code
        ORDER BY r.currency_code ASC, total_minor DESC, c.normalized_name ASC, r.category_id ASC;
      `);

      return {
        categoryTotals: categoryRows.map(mapCategoryTotal),
        monthlyTotals: monthlyRows.map(mapMonthlyTotal),
      };
    });
  }
}

function mapMonthlyTotal(row: MonthlyTotalRow): MonthlyExpenseTotal {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(row.purchase_month)) {
    throw new Error('Stored monthly total has an invalid purchase month.');
  }

  return {
    currencyCode: requireCurrencyCode(row.currency_code),
    month: row.purchase_month,
    receiptCount: requireReceiptCount(row.receipt_count),
    totalMinor: requireTotal(row.total_minor),
  };
}

function mapCategoryTotal(row: CategoryTotalRow): CategoryExpenseTotal {
  return {
    category: mapCategory(row),
    currencyCode: requireCurrencyCode(row.currency_code),
    receiptCount: requireReceiptCount(row.receipt_count),
    totalMinor: requireTotal(row.total_minor),
  };
}

function mapCategory(row: CategoryTotalRow): Category | null {
  if (row.category_id === null) {
    if (
      row.category_name !== null ||
      row.category_normalized_name !== null ||
      row.category_created_at !== null ||
      row.category_updated_at !== null ||
      row.category_version !== null ||
      row.category_deleted_at !== null
    ) {
      throw new Error('Stored uncategorized total contains category data.');
    }

    return null;
  }

  if (
    row.category_name === null ||
    row.category_normalized_name === null ||
    row.category_created_at === null ||
    row.category_updated_at === null ||
    row.category_version === null
  ) {
    throw new Error('Stored report references an unavailable category.');
  }

  const category: Category = {
    createdAt: row.category_created_at,
    deletedAt: row.category_deleted_at,
    id: row.category_id,
    name: row.category_name,
    normalizedName: row.category_normalized_name,
    updatedAt: row.category_updated_at,
    version: row.category_version,
  };
  assertValidCategory(category);

  if (category.deletedAt !== null) {
    throw new Error('Stored report references a deleted category.');
  }

  return category;
}

function requireCurrencyCode(value: string): SupportedCurrencyCode {
  if (!isSupportedCurrencyCode(value)) {
    throw new Error('Stored expense total has an unsupported currency.');
  }

  return value;
}

function requireReceiptCount(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Stored expense total has an invalid receipt count.');
  }

  return value;
}

function requireTotal(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('Stored expense total exceeds supported integer limits.');
  }

  return value;
}
