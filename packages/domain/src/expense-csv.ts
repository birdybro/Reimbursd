// SPDX-License-Identifier: GPL-3.0-only
import { minorUnitsToDecimal } from './money.js';
import { ReceiptValidationError, validateReceipt, type Receipt } from './receipt.js';

const csvHeaders = [
  'receipt_id',
  'merchant_id',
  'merchant_name',
  'purchased_at',
  'captured_at',
  'currency_code',
  'subtotal',
  'tax',
  'tip',
  'discount',
  'total',
  'category_id',
  'location_id',
  'notes',
  'source_type',
  'created_at',
  'updated_at',
  'version',
] as const;

export function createExpenseCsv(receipts: readonly Receipt[]): string {
  for (const receipt of receipts) {
    const issues = validateReceipt(receipt);

    if (issues.length > 0) {
      throw new ReceiptValidationError(issues);
    }
  }

  const activeReceipts = [...receipts.filter(({ deletedAt }) => deletedAt === null)].sort(
    (left, right) =>
      right.purchasedAt.localeCompare(left.purchasedAt) || left.id.localeCompare(right.id),
  );
  const rows = activeReceipts.map((receipt) =>
    [
      receipt.id,
      receipt.merchantId,
      protectSpreadsheetCell(receipt.merchantName),
      receipt.purchasedAt,
      receipt.capturedAt,
      receipt.currencyCode,
      minorUnitsToDecimal(receipt.subtotalMinor, receipt.currencyCode),
      minorUnitsToDecimal(receipt.taxMinor, receipt.currencyCode),
      minorUnitsToDecimal(receipt.tipMinor, receipt.currencyCode),
      minorUnitsToDecimal(receipt.discountMinor, receipt.currencyCode),
      minorUnitsToDecimal(receipt.totalMinor, receipt.currencyCode),
      receipt.categoryId ?? '',
      receipt.locationId ?? '',
      protectSpreadsheetCell(receipt.notes),
      receipt.sourceType,
      receipt.createdAt,
      receipt.updatedAt,
      receipt.version.toString(),
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  return [csvHeaders.join(','), ...rows].join('\r\n') + '\r\n';
}

function protectSpreadsheetCell(value: string): string {
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function escapeCsvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
