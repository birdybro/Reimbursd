// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { createHostedReceiptInput, formatDraftTotal, type ReceiptDraft } from './receipt-draft.js';

const draft: ReceiptDraft = {
  currencyCode: 'USD',
  merchantName: '  Synthetic Web Merchant  ',
  notes: ' Test only ',
  purchaseDate: '2026-07-18',
  subtotal: '10.00',
  tax: '0.80',
  tip: '2.00',
};

describe('hosted receipt draft', () => {
  it('creates integer-minor-unit API input with local date offset', () => {
    const ids = ['10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001'];
    const input = createHostedReceiptInput(draft, {
      idFactory: () => ids.shift() ?? '',
      now: () => new Date('2026-07-18T18:00:00.000Z'),
      timezoneOffsetMinutes: 360,
    });

    expect(input).toMatchObject({
      merchantName: 'Synthetic Web Merchant',
      notes: 'Test only',
      purchasedAt: '2026-07-18T12:00:00-06:00',
      subtotalMinor: 1_000,
      taxMinor: 80,
      tipMinor: 200,
      totalMinor: 1_280,
    });
    expect(formatDraftTotal(draft)).toBe('$12.80');
  });

  it('rejects negative, over-precision, and malformed values', () => {
    for (const subtotal of ['-1.00', '1.001', 'not-money']) {
      expect(() =>
        createHostedReceiptInput(
          { ...draft, subtotal },
          {
            idFactory: () => '10000000-0000-4000-8000-000000000001',
            now: () => new Date('2026-07-18T18:00:00.000Z'),
            timezoneOffsetMinutes: 0,
          },
        ),
      ).toThrow('Check the highlighted expense fields.');
    }
  });
});
