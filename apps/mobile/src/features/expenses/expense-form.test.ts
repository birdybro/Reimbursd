// SPDX-License-Identifier: GPL-3.0-only
import { createManualReceipt } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';

import {
  createEmptyExpenseForm,
  parseExpenseForm,
  receiptToExpenseForm,
  type ExpenseFormValues,
} from './expense-form';

const now = new Date('2026-07-14T18:30:00.000Z');
const ids = [
  'a63d1cf2-e63b-4c9a-b358-6f54cd9f5ca1',
  '56ef60a4-7f06-4d2f-a2f4-a0d45667c5f3',
  'e8535b72-64aa-46bf-9c2c-100f60524cb8',
];

describe('expense form boundary', () => {
  it('creates a validated manual receipt in minor units', () => {
    const result = parseExpenseForm(validForm(), options());

    expect(result).toMatchObject({
      submission: {
        kind: 'create',
        receipt: {
          currencyCode: 'USD',
          merchantName: 'Corner Market',
          purchasedAt: '2026-07-14T12:00:00-06:00',
          subtotalMinor: 1_000,
          taxMinor: 80,
          tipMinor: 200,
          totalMinor: 1_280,
        },
      },
      success: true,
    });
  });

  it('treats blank optional adjustment amounts as zero', () => {
    const result = parseExpenseForm(
      { ...validForm(), discount: '', tax: '', tip: '', total: '10.00' },
      options(),
    );

    expect(result).toMatchObject({
      submission: {
        receipt: { discountMinor: 0, taxMinor: 0, tipMinor: 0, totalMinor: 1_000 },
      },
      success: true,
    });
  });

  it('returns accessible field errors without producing a partial record', () => {
    const result = parseExpenseForm(
      {
        ...validForm(),
        merchantName: ' ',
        purchaseDate: '2026-02-29',
        subtotal: '12.345',
        total: 'nope',
      },
      options(),
    );

    expect(result).toEqual({
      errors: {
        merchantName: 'Enter a merchant name.',
        purchaseDate: 'Enter a real calendar date.',
        subtotal: 'USD amounts support at most 2 decimal places.',
        total: 'Enter an amount using digits and an optional decimal point.',
      },
      success: false,
    });
  });

  it('creates a version-aware update and a new candidate merchant ID', () => {
    const receipt = createManualReceipt({
      capturedAt: now.toISOString(),
      currencyCode: 'USD',
      id: ids[0]!,
      merchantId: ids[1]!,
      merchantName: 'Corner Market',
      purchasedAt: '2026-07-14T12:00:00-06:00',
      subtotalMinor: 1_000,
      taxMinor: 80,
      tipMinor: 200,
      totalMinor: 1_280,
    });
    const result = parseExpenseForm(
      { ...receiptToExpenseForm(receipt), merchantName: 'Updated Market' },
      options(receipt),
    );

    expect(result).toMatchObject({
      submission: {
        input: {
          expectedVersion: 1,
          id: receipt.id,
          merchantId: ids[2],
          merchantName: 'Updated Market',
        },
        kind: 'update',
      },
      success: true,
    });
  });

  it('formats empty and stored values for editing', () => {
    expect(createEmptyExpenseForm(new Date(2026, 6, 14))).toMatchObject({
      currencyCode: 'USD',
      discount: '0.00',
      purchaseDate: '2026-07-14',
      tax: '0.00',
      tip: '0.00',
    });
  });
});

function options(receipt?: ReturnType<typeof createManualReceipt>) {
  let index = receipt === undefined ? 0 : 2;
  return {
    idFactory: () => ids[index++]!,
    now,
    ...(receipt === undefined ? {} : { receipt }),
    timezoneOffsetMinutes: 360,
  };
}

function validForm(): ExpenseFormValues {
  return {
    currencyCode: 'USD',
    discount: '0.00',
    merchantName: ' Corner Market ',
    notes: '',
    purchaseDate: '2026-07-14',
    subtotal: '10.00',
    tax: '0.80',
    tip: '2.00',
    total: '12.80',
  };
}
