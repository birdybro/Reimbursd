// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  createManualReceipt,
  getPurchaseDate,
  localDateToOffsetDateTime,
  ReceiptValidationError,
  validateReceipt,
} from './receipt.js';

const validInput = {
  capturedAt: '2026-07-14T18:30:00.000Z',
  currencyCode: 'USD' as const,
  id: 'a63d1cf2-e63b-4c9a-b358-6f54cd9f5ca1',
  merchantId: '56ef60a4-7f06-4d2f-a2f4-a0d45667c5f3',
  merchantName: 'Corner Market',
  purchasedAt: '2026-07-14T12:00:00-06:00',
  subtotalMinor: 1_000,
  taxMinor: 80,
  tipMinor: 200,
  totalMinor: 1_280,
};

describe('manual receipts', () => {
  it('creates a versioned manual receipt using integer minor units', () => {
    const receipt = createManualReceipt(validInput);

    expect(receipt).toMatchObject({
      currencyCode: 'USD',
      deletedAt: null,
      discountMinor: 0,
      sourceType: 'manual',
      totalMinor: 1_280,
      version: 1,
    });
    expect(validateReceipt(receipt)).toEqual([]);
  });

  it('rejects totals that do not reconcile', () => {
    expect(() => createManualReceipt({ ...validInput, totalMinor: 1_200 })).toThrowError(
      ReceiptValidationError,
    );

    try {
      createManualReceipt({ ...validInput, totalMinor: 1_200 });
    } catch (error) {
      expect(error).toBeInstanceOf(ReceiptValidationError);
      expect((error as ReceiptValidationError).issues).toContainEqual({
        field: 'totalMinor',
        message: 'Total must equal subtotal plus tax and tip, less discount.',
      });
    }
  });

  it('rejects invalid IDs, timestamps, amounts, and merchant names together', () => {
    try {
      createManualReceipt({
        ...validInput,
        capturedAt: 'today',
        id: 'receipt-1',
        merchantName: ' ',
        subtotalMinor: 12.5,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ReceiptValidationError);
      const fields = (error as ReceiptValidationError).issues.map((issue) => issue.field);
      expect(fields).toEqual(
        expect.arrayContaining(['id', 'merchantName', 'capturedAt', 'subtotalMinor']),
      );
    }
  });

  it('validates optional category and location identifiers', () => {
    const receipt = createManualReceipt(validInput);
    const fields = validateReceipt({
      ...receipt,
      categoryId: 'category-1',
      locationId: 'location-1',
    }).map(({ field }) => field);

    expect(fields).toEqual(expect.arrayContaining(['categoryId', 'locationId']));
  });

  it('preserves the local purchase date and original timezone offset', () => {
    const purchasedAt = localDateToOffsetDateTime('2026-07-14', 360);

    expect(purchasedAt).toBe('2026-07-14T12:00:00-06:00');
    expect(getPurchaseDate(purchasedAt)).toBe('2026-07-14');
    expect(localDateToOffsetDateTime('2026-07-14', -330)).toBe('2026-07-14T12:00:00+05:30');
  });

  it('rejects malformed and impossible calendar dates', () => {
    expect(() => localDateToOffsetDateTime('07/14/2026', 360)).toThrowError(ReceiptValidationError);
    expect(() => localDateToOffsetDateTime('2026-02-29', 360)).toThrowError(ReceiptValidationError);
    expect(localDateToOffsetDateTime('2028-02-29', 360)).toBe('2028-02-29T12:00:00-06:00');
  });
});
