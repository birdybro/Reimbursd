// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import { createExpenseCsv } from './expense-csv.js';
import { createManualReceipt, ReceiptValidationError, type Receipt } from './receipt.js';

describe('expense CSV export', () => {
  it('serializes active receipts deterministically with exact currency decimals', () => {
    const older = makeReceipt({
      currencyCode: 'JPY',
      purchasedAt: '2026-06-01T09:00:00+09:00',
      totalMinor: 450,
    });
    const newer = makeReceipt({
      currencyCode: 'USD',
      purchasedAt: '2026-07-17T12:00:00-06:00',
      totalMinor: 1_234,
    });

    const csv = createExpenseCsv([older, newer]);
    const lines = csv.split('\r\n');

    expect(lines[0]).toBe(
      'receipt_id,merchant_id,merchant_name,purchased_at,captured_at,currency_code,subtotal,tax,tip,discount,total,category_id,location_id,notes,source_type,created_at,updated_at,version',
    );
    expect(lines[1]).toContain(`${newer.id},${newer.merchantId},Synthetic Market`);
    expect(lines[1]).toContain(',USD,12.34,0.00,0.00,0.00,12.34,');
    expect(lines[2]).toContain(`${older.id},${older.merchantId},Synthetic Market`);
    expect(lines[2]).toContain(',JPY,450,0,0,0,450,');
    expect(lines[3]).toBe('');
  });

  it('quotes structured text and neutralizes spreadsheet formulas', () => {
    const receipt = makeReceipt({
      merchantName: '=HYPERLINK("https://invalid.test")',
      notes: '+SUM(1,2)\nSynthetic note',
    });

    const csv = createExpenseCsv([receipt]);

    expect(csv).toContain('"\'=HYPERLINK(""https://invalid.test"")"');
    expect(csv).toContain('"\'+SUM(1,2)\nSynthetic note"');
  });

  it('excludes deletion tombstones while retaining a valid header-only export', () => {
    const receipt = makeReceipt();
    const deleted: Receipt = {
      ...receipt,
      deletedAt: '2026-07-17T13:00:00-06:00',
      updatedAt: '2026-07-17T13:00:00-06:00',
      version: 2,
    };

    expect(createExpenseCsv([deleted])).toBe(
      'receipt_id,merchant_id,merchant_name,purchased_at,captured_at,currency_code,subtotal,tax,tip,discount,total,category_id,location_id,notes,source_type,created_at,updated_at,version\r\n',
    );
  });

  it('rejects invalid receipt data at the export boundary', () => {
    const receipt = { ...makeReceipt(), totalMinor: 123.5 };

    expect(() => createExpenseCsv([receipt])).toThrow(ReceiptValidationError);
  });
});

let uuidSequence = 0;

function makeReceipt(
  overrides: Partial<{
    currencyCode: 'JPY' | 'USD';
    merchantName: string;
    notes: string;
    purchasedAt: string;
    totalMinor: number;
  }> = {},
) {
  const currencyCode = overrides.currencyCode ?? 'USD';
  const totalMinor = overrides.totalMinor ?? 1_234;
  return createManualReceipt({
    capturedAt: '2026-07-17T12:05:00-06:00',
    currencyCode,
    id: nextUuid(),
    merchantId: nextUuid(),
    merchantName: overrides.merchantName ?? 'Synthetic Market',
    purchasedAt: overrides.purchasedAt ?? '2026-07-17T12:00:00-06:00',
    subtotalMinor: totalMinor,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor,
    ...(overrides.notes === undefined ? {} : { notes: overrides.notes }),
  });
}

function nextUuid(): string {
  uuidSequence += 1;
  return `00000000-0000-4000-8000-${uuidSequence.toString().padStart(12, '0')}`;
}
