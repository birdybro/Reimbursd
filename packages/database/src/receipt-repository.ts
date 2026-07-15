// SPDX-License-Identifier: GPL-3.0-only
import {
  isSupportedCurrencyCode,
  validateReceipt,
  ReceiptValidationError,
  type Receipt,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface ReceiptListOptions {
  readonly currencyCode?: SupportedCurrencyCode | null;
  readonly search?: string;
}

export interface UpdateReceiptInput {
  readonly currencyCode: SupportedCurrencyCode;
  readonly discountMinor: number;
  readonly expectedVersion: number;
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchasedAt: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly tipMinor: number;
  readonly totalMinor: number;
  readonly updatedAt: string;
}

export interface ReceiptRepository {
  create(receipt: Receipt): Promise<Receipt>;
  delete(id: string, expectedVersion: number, deletedAt: string): Promise<Receipt>;
  getById(id: string): Promise<Receipt | null>;
  list(options?: ReceiptListOptions): Promise<readonly Receipt[]>;
  update(input: UpdateReceiptInput): Promise<Receipt>;
}

export class ReceiptNotFoundError extends Error {
  constructor() {
    super('Receipt was not found.');
    this.name = 'ReceiptNotFoundError';
  }
}

export class ReceiptConflictError extends Error {
  constructor() {
    super('Receipt changed since it was opened. Reload it before saving.');
    this.name = 'ReceiptConflictError';
  }
}

interface ReceiptRow {
  captured_at: string;
  category_id: string | null;
  created_at: string;
  currency_code: string;
  deleted_at: string | null;
  discount_minor: number;
  id: string;
  location_id: string | null;
  merchant_id: string;
  merchant_name: string;
  notes: string;
  purchased_at: string;
  source_type: string;
  subtotal_minor: number;
  tax_minor: number;
  tip_minor: number;
  total_minor: number;
  updated_at: string;
  version: number;
}

const selectReceipt = `
  SELECT
    r.id,
    r.merchant_id,
    m.display_name AS merchant_name,
    r.location_id,
    r.purchased_at,
    r.captured_at,
    r.currency_code,
    r.subtotal_minor,
    r.tax_minor,
    r.tip_minor,
    r.discount_minor,
    r.total_minor,
    r.category_id,
    r.source_type,
    r.notes,
    r.created_at,
    r.updated_at,
    r.version,
    r.deleted_at
  FROM receipts r
  INNER JOIN merchants m ON m.id = r.merchant_id
`;

export class SqliteReceiptRepository implements ReceiptRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async create(receipt: Receipt): Promise<Receipt> {
    assertValidReceipt(receipt);

    return this.#connection.transaction(async () => {
      const merchantId = await this.#upsertMerchant(
        receipt.merchantId,
        receipt.merchantName,
        receipt.createdAt,
      );
      const storedReceipt = { ...receipt, merchantId };

      await this.#connection.run(
        `
          INSERT INTO receipts (
            id, merchant_id, location_id, purchased_at, captured_at, currency_code,
            subtotal_minor, tax_minor, tip_minor, discount_minor, total_minor,
            category_id, source_type, notes, created_at, updated_at, version, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        receiptParameters(storedReceipt),
      );

      return storedReceipt;
    });
  }

  async delete(id: string, expectedVersion: number, deletedAt: string): Promise<Receipt> {
    return this.#connection.transaction(async () => {
      const existing = await this.#requireActive(id);
      assertExpectedVersion(existing, expectedVersion);
      const deletedReceipt: Receipt = {
        ...existing,
        deletedAt,
        updatedAt: deletedAt,
        version: existing.version + 1,
      };
      assertValidReceipt(deletedReceipt);

      const result = await this.#connection.run(
        `
          UPDATE receipts
          SET deleted_at = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND version = ? AND deleted_at IS NULL;
        `,
        [deletedAt, deletedAt, id, expectedVersion],
      );

      if (result.changes !== 1) {
        throw new ReceiptConflictError();
      }

      return deletedReceipt;
    });
  }

  async getById(id: string): Promise<Receipt | null> {
    const row = await this.#connection.getFirst<ReceiptRow>(
      `${selectReceipt} WHERE r.id = ? AND r.deleted_at IS NULL;`,
      [id],
    );

    return row === null ? null : mapReceiptRow(row);
  }

  async list(options: ReceiptListOptions = {}): Promise<readonly Receipt[]> {
    if (options.currencyCode !== undefined && options.currencyCode !== null) {
      if (!isSupportedCurrencyCode(options.currencyCode)) {
        throw new TypeError('Currency filter is not supported.');
      }
    }

    const conditions = ['r.deleted_at IS NULL'];
    const parameters: SqliteValue[] = [];
    const normalizedSearch = normalizeMerchantName(options.search ?? '');

    if (normalizedSearch.length > 0) {
      conditions.push("m.normalized_name LIKE ? ESCAPE '\\'");
      parameters.push(`%${escapeLikePattern(normalizedSearch)}%`);
    }

    if (options.currencyCode !== undefined && options.currencyCode !== null) {
      conditions.push('r.currency_code = ?');
      parameters.push(options.currencyCode);
    }

    const rows = await this.#connection.getAll<ReceiptRow>(
      `${selectReceipt}
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.purchased_at DESC, r.created_at DESC, r.id ASC;`,
      parameters,
    );

    return rows.map(mapReceiptRow);
  }

  async update(input: UpdateReceiptInput): Promise<Receipt> {
    return this.#connection.transaction(async () => {
      const existing = await this.#requireActive(input.id);
      assertExpectedVersion(existing, input.expectedVersion);
      const candidate: Receipt = {
        ...existing,
        currencyCode: input.currencyCode,
        discountMinor: input.discountMinor,
        merchantId: input.merchantId,
        merchantName: input.merchantName.trim(),
        notes: input.notes.trim(),
        purchasedAt: input.purchasedAt,
        subtotalMinor: input.subtotalMinor,
        taxMinor: input.taxMinor,
        tipMinor: input.tipMinor,
        totalMinor: input.totalMinor,
        updatedAt: input.updatedAt,
        version: existing.version + 1,
      };
      assertValidReceipt(candidate);
      const merchantId = await this.#upsertMerchant(
        candidate.merchantId,
        candidate.merchantName,
        candidate.updatedAt,
      );
      const storedReceipt = { ...candidate, merchantId };

      const result = await this.#connection.run(
        `
          UPDATE receipts
          SET
            merchant_id = ?, purchased_at = ?, currency_code = ?, subtotal_minor = ?,
            tax_minor = ?, tip_minor = ?, discount_minor = ?, total_minor = ?, notes = ?,
            updated_at = ?, version = version + 1
          WHERE id = ? AND version = ? AND deleted_at IS NULL;
        `,
        [
          storedReceipt.merchantId,
          storedReceipt.purchasedAt,
          storedReceipt.currencyCode,
          storedReceipt.subtotalMinor,
          storedReceipt.taxMinor,
          storedReceipt.tipMinor,
          storedReceipt.discountMinor,
          storedReceipt.totalMinor,
          storedReceipt.notes,
          storedReceipt.updatedAt,
          storedReceipt.id,
          input.expectedVersion,
        ],
      );

      if (result.changes !== 1) {
        throw new ReceiptConflictError();
      }

      return storedReceipt;
    });
  }

  async #requireActive(id: string): Promise<Receipt> {
    const receipt = await this.getById(id);

    if (receipt === null) {
      throw new ReceiptNotFoundError();
    }

    return receipt;
  }

  async #upsertMerchant(id: string, displayName: string, timestamp: string): Promise<string> {
    const normalizedName = normalizeMerchantName(displayName);
    const existing = await this.#connection.getFirst<{ id: string }>(
      'SELECT id FROM merchants WHERE normalized_name = ?;',
      [normalizedName],
    );

    if (existing !== null) {
      await this.#connection.run(
        'UPDATE merchants SET display_name = ?, updated_at = ? WHERE id = ?;',
        [displayName.trim(), timestamp, existing.id],
      );
      return existing.id;
    }

    await this.#connection.run(
      `
        INSERT INTO merchants (
          id, display_name, normalized_name, website, phone, created_at, updated_at
        ) VALUES (?, ?, ?, NULL, NULL, ?, ?);
      `,
      [id, displayName.trim(), normalizedName, timestamp, timestamp],
    );
    return id;
  }
}

function assertExpectedVersion(receipt: Receipt, expectedVersion: number): void {
  if (receipt.version !== expectedVersion) {
    throw new ReceiptConflictError();
  }
}

function assertValidReceipt(receipt: Receipt): void {
  const issues = validateReceipt(receipt);

  if (issues.length > 0) {
    throw new ReceiptValidationError(issues);
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function mapReceiptRow(row: ReceiptRow): Receipt {
  if (!isSupportedCurrencyCode(row.currency_code) || row.source_type !== 'manual') {
    throw new Error('Stored receipt contains unsupported enum data.');
  }

  const receipt: Receipt = {
    capturedAt: row.captured_at,
    categoryId: row.category_id,
    createdAt: row.created_at,
    currencyCode: row.currency_code,
    deletedAt: row.deleted_at,
    discountMinor: row.discount_minor,
    id: row.id,
    locationId: row.location_id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    notes: row.notes,
    purchasedAt: row.purchased_at,
    sourceType: row.source_type,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    tipMinor: row.tip_minor,
    totalMinor: row.total_minor,
    updatedAt: row.updated_at,
    version: row.version,
  };
  assertValidReceipt(receipt);
  return receipt;
}

function normalizeMerchantName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function receiptParameters(receipt: Receipt): readonly SqliteValue[] {
  return [
    receipt.id,
    receipt.merchantId,
    receipt.locationId,
    receipt.purchasedAt,
    receipt.capturedAt,
    receipt.currencyCode,
    receipt.subtotalMinor,
    receipt.taxMinor,
    receipt.tipMinor,
    receipt.discountMinor,
    receipt.totalMinor,
    receipt.categoryId,
    receipt.sourceType,
    receipt.notes,
    receipt.createdAt,
    receipt.updatedAt,
    receipt.version,
    receipt.deletedAt,
  ];
}
