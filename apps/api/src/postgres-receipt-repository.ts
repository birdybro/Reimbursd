// SPDX-License-Identifier: GPL-3.0-only
import {
  isSupportedCurrencyCode,
  isUuid,
  validateReceipt,
  ReceiptValidationError,
  type Receipt,
  type ReceiptValidationIssue,
} from '@reimbursd/domain';
import type { Pool, PoolClient } from 'pg';
import {
  HostedReceiptAlreadyExistsError,
  type HostedReceiptRepository,
} from './receipt-repository.js';

interface HostedReceiptRow {
  captured_at: string;
  category_id: string | null;
  created_at: string;
  currency_code: string;
  deleted_at: string | null;
  discount_minor: string;
  id: string;
  location_id: string | null;
  merchant_id: string;
  merchant_name: string;
  notes: string;
  purchased_at: string;
  source_type: string;
  subtotal_minor: string;
  tax_minor: string;
  tip_minor: string;
  total_minor: string;
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
  FROM hosted_receipts r
  INNER JOIN hosted_merchants m
    ON m.owner_id = r.owner_id AND m.id = r.merchant_id
`;

export class PostgresHostedReceiptRepository implements HostedReceiptRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async create(ownerId: string, receipt: Receipt): Promise<Receipt> {
    assertUuid(ownerId, 'Owner ID');
    assertValidReceipt(receipt);
    const client = await this.#pool.connect();
    let transactionStarted = false;

    try {
      await client.query('BEGIN;');
      transactionStarted = true;
      const merchantResult = await client.query<{ id: string }>(
        `
          INSERT INTO hosted_merchants (
            id, owner_id, display_name, normalized_name, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO UPDATE SET
            display_name = EXCLUDED.display_name,
            normalized_name = EXCLUDED.normalized_name,
            updated_at = EXCLUDED.updated_at
          WHERE hosted_merchants.owner_id = EXCLUDED.owner_id
          RETURNING id;
        `,
        [
          receipt.merchantId,
          ownerId,
          receipt.merchantName,
          normalizeMerchantName(receipt.merchantName),
          receipt.createdAt,
          receipt.updatedAt,
        ],
      );

      if (merchantResult.rowCount !== 1) {
        throw new HostedReceiptAlreadyExistsError();
      }

      await client.query(
        `
          INSERT INTO hosted_receipts (
            id, owner_id, merchant_id, location_id, purchased_at, captured_at,
            currency_code, subtotal_minor, tax_minor, tip_minor, discount_minor,
            total_minor, category_id, source_type, notes, created_at, updated_at,
            version, deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16, $17, $18, $19
          );
        `,
        [
          receipt.id,
          ownerId,
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
        ],
      );
      await client.query('COMMIT;');
      transactionStarted = false;
      return { ...receipt };
    } catch (error) {
      if (transactionStarted) {
        await rollbackOrThrow(client, error);
      }

      if (error instanceof HostedReceiptAlreadyExistsError || isConstraintConflict(error)) {
        throw new HostedReceiptAlreadyExistsError();
      }

      throw error;
    } finally {
      client.release();
    }
  }

  async getByIdForOwner(ownerId: string, receiptId: string): Promise<Receipt | null> {
    assertUuid(ownerId, 'Owner ID');
    assertUuid(receiptId, 'Receipt ID');
    const result = await this.#pool.query<HostedReceiptRow>(
      `${selectReceipt}
       WHERE r.owner_id = $1 AND r.id = $2 AND r.deleted_at IS NULL;`,
      [ownerId, receiptId],
    );
    const row = result.rows[0];
    return row ? mapReceiptRow(row) : null;
  }
}

function mapReceiptRow(row: HostedReceiptRow): Receipt {
  const issues: ReceiptValidationIssue[] = [];

  if (!isSupportedCurrencyCode(row.currency_code)) {
    issues.push({ field: 'currencyCode', message: 'Stored currency code is invalid.' });
  }

  if (row.source_type !== 'manual') {
    issues.push({ field: 'sourceType', message: 'Stored source type is invalid.' });
  }

  if (issues.length > 0 || !isSupportedCurrencyCode(row.currency_code)) {
    throw new ReceiptValidationError(issues);
  }

  const receipt: Receipt = {
    capturedAt: row.captured_at,
    categoryId: row.category_id,
    createdAt: row.created_at,
    currencyCode: row.currency_code,
    deletedAt: row.deleted_at,
    discountMinor: parseMinorUnits(row.discount_minor, 'discountMinor'),
    id: row.id,
    locationId: row.location_id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    notes: row.notes,
    purchasedAt: row.purchased_at,
    sourceType: 'manual',
    subtotalMinor: parseMinorUnits(row.subtotal_minor, 'subtotalMinor'),
    taxMinor: parseMinorUnits(row.tax_minor, 'taxMinor'),
    tipMinor: parseMinorUnits(row.tip_minor, 'tipMinor'),
    totalMinor: parseMinorUnits(row.total_minor, 'totalMinor'),
    updatedAt: row.updated_at,
    version: row.version,
  };
  assertValidReceipt(receipt);
  return receipt;
}

function parseMinorUnits(value: string, field: ReceiptValidationIssue['field']): number {
  const parsed = Number(value);

  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed)) {
    throw new ReceiptValidationError([
      { field, message: 'Stored amount is outside the supported safe-integer range.' },
    ]);
  }

  return parsed;
}

function assertValidReceipt(receipt: Receipt): void {
  const issues = validateReceipt(receipt);

  if (issues.length > 0) {
    throw new ReceiptValidationError(issues);
  }
}

function normalizeMerchantName(name: string): string {
  return name.trim().toLocaleLowerCase('en-US').replace(/\s+/g, ' ');
}

function isConstraintConflict(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function assertUuid(value: string, label: string): void {
  if (!isUuid(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
}

async function rollbackOrThrow(client: PoolClient, originalError: unknown): Promise<void> {
  try {
    await client.query('ROLLBACK;');
  } catch (rollbackError) {
    throw new AggregateError(
      [originalError, rollbackError],
      'Hosted receipt write and rollback both failed.',
    );
  }
}
