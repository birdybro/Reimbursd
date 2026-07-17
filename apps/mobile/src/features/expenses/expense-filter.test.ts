// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  countActiveExpenseFilters,
  emptyExpenseFilters,
  parseExpenseFilters,
} from './expense-filter.js';

describe('expense filter boundary', () => {
  it('produces exact repository options in integer minor units', () => {
    const result = parseExpenseFilters({
      categoryId: '11111111-1111-4111-8111-111111111111',
      currencyCode: 'USD',
      maximumTotal: '25.50',
      minimumTotal: '10.00',
      purchasedFrom: '2026-07-01',
      purchasedTo: '2026-07-31',
      tagId: '22222222-2222-4222-8222-222222222222',
    });

    expect(result).toEqual({
      options: {
        categoryId: '11111111-1111-4111-8111-111111111111',
        currencyCode: 'USD',
        maximumTotalMinor: 2_550,
        minimumTotalMinor: 1_000,
        purchasedFrom: '2026-07-01',
        purchasedTo: '2026-07-31',
        tagId: '22222222-2222-4222-8222-222222222222',
      },
      success: true,
    });
  });

  it('distinguishes uncategorized from all categories', () => {
    expect(parseExpenseFilters({ ...emptyExpenseFilters, categoryId: null })).toEqual({
      options: { categoryId: null },
      success: true,
    });
    expect(parseExpenseFilters(emptyExpenseFilters)).toEqual({ options: {}, success: true });
  });

  it('returns recoverable errors for invalid ranges and ambiguous amounts', () => {
    expect(
      parseExpenseFilters({
        ...emptyExpenseFilters,
        maximumTotal: '5.00',
        minimumTotal: '10.00',
        purchasedFrom: '2026-07-31',
        purchasedTo: '2026-07-01',
      }),
    ).toMatchObject({
      errors: {
        currencyCode: 'Select a currency before filtering by amount.',
        purchasedTo: 'End date cannot be before start date.',
      },
      success: false,
    });
  });

  it('counts filter groups rather than individual range bounds', () => {
    expect(
      countActiveExpenseFilters({
        ...emptyExpenseFilters,
        categoryId: null,
        currencyCode: 'USD',
        maximumTotal: '20',
        minimumTotal: '10',
        purchasedFrom: '2026-07-01',
        purchasedTo: '2026-07-31',
      }),
    ).toBe(4);
  });
});
