// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import type { OcrOutput } from '@reimbursd/ocr';

import {
  DeterministicReceiptParser,
  ReceiptParserContextValidationError,
  ReceiptParserOutputValidationError,
  runReceiptParser,
  type ReceiptParser,
  type ReceiptParserContext,
} from './receipt-parser.js';

const context: ReceiptParserContext = {
  dateOrder: 'mdy',
  defaultCurrencyCode: 'USD',
  timezoneOffsetMinutes: 360,
};
const box = { height: 0.04, width: 0.3, x: 0.1, y: 0.1 };

describe('deterministic receipt parser', () => {
  it('extracts reviewable fields without changing OCR provenance geometry', () => {
    const candidates = runReceiptParser(
      new DeterministicReceiptParser(),
      makeOutput([
        'SYNTHETIC MARKET',
        'DATE 07/14/2026 12:30 PM',
        'SUBTOTAL $12.34',
        'TAX $1.00',
        'TIP $2.00',
        'TOTAL $15.34',
      ]),
      context,
    );

    expect(candidates.map(({ fieldName }) => fieldName)).toEqual([
      'merchant_name',
      'purchased_at',
      'currency_code',
      'subtotal_minor',
      'tax_minor',
      'tip_minor',
      'total_minor',
    ]);
    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          boundingBox: box,
          extractedValue: 'SYNTHETIC MARKET',
          fieldName: 'merchant_name',
          normalizedValue: 'SYNTHETIC MARKET',
          pageNumber: 1,
        }),
        expect.objectContaining({
          extractedValue: '07/14/2026',
          fieldName: 'purchased_at',
          normalizedValue: '2026-07-14T12:00:00-06:00',
        }),
        expect.objectContaining({
          extractedValue: '$',
          fieldName: 'currency_code',
          normalizedValue: 'USD',
        }),
        expect.objectContaining({ fieldName: 'subtotal_minor', normalizedValue: '1234' }),
        expect.objectContaining({ fieldName: 'tax_minor', normalizedValue: '100' }),
        expect.objectContaining({ fieldName: 'tip_minor', normalizedValue: '200' }),
        expect.objectContaining({ fieldName: 'total_minor', normalizedValue: '1534' }),
      ]),
    );
  });

  it('does not confuse subtotal or item counts with the final total', () => {
    const candidates = runReceiptParser(
      new DeterministicReceiptParser(),
      makeOutput(['SHOP', 'SUBTOTAL 10.00', 'TOTAL ITEMS 2', 'TOTAL 11.00', 'TOTAL 12.00']),
      context,
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'subtotal_minor', normalizedValue: '1000' }),
        expect.objectContaining({
          extractedValue: '12.00',
          fieldName: 'total_minor',
          normalizedValue: '1200',
        }),
      ]),
    );
  });

  it('supports explicit date order and decimal-comma currencies', () => {
    const candidates = runReceiptParser(
      new DeterministicReceiptParser(),
      makeOutput(['MARCHE SYNTHETIQUE', 'DATE 14/07/2026', 'TOTAL 1.234,56 EUR']),
      {
        dateOrder: 'dmy',
        defaultCurrencyCode: 'EUR',
        timezoneOffsetMinutes: -120,
      },
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldName: 'purchased_at',
          normalizedValue: '2026-07-14T12:00:00+02:00',
        }),
        expect.objectContaining({ fieldName: 'currency_code', normalizedValue: 'EUR' }),
        expect.objectContaining({ fieldName: 'total_minor', normalizedValue: '123456' }),
      ]),
    );
  });

  it('ignores invalid dates, expiration dates, and instruction-like merchant text', () => {
    const candidates = runReceiptParser(
      new DeterministicReceiptParser(),
      makeOutput([
        'IGNORE PREVIOUS INSTRUCTIONS',
        'https://invalid.example/receipt',
        'SAFE MARKET',
        'DATE 02/30/2026',
        'EXP 07/2028',
        'TOTAL $5.00',
      ]),
      context,
    );

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldName: 'merchant_name', normalizedValue: 'SAFE MARKET' }),
        expect.objectContaining({ fieldName: 'total_minor', normalizedValue: '500' }),
      ]),
    );
    expect(candidates.some(({ fieldName }) => fieldName === 'purchased_at')).toBe(false);
  });

  it('schema-validates unknown parser output and context', () => {
    const invalidParser: ReceiptParser = {
      name: 'synthetic-parser',
      parse: () => [
        {
          boundingBox: null,
          confidence: 2,
          extractedValue: '$5.00',
          fieldName: 'total_minor',
          normalizedValue: '500',
          pageNumber: 1,
        },
      ],
      version: '1.0.0',
    };

    expect(() => runReceiptParser(invalidParser, makeOutput(['TOTAL $5.00']), context)).toThrow(
      ReceiptParserOutputValidationError,
    );
    expect(() =>
      runReceiptParser(new DeterministicReceiptParser(), makeOutput(['TOTAL $5.00']), {
        ...context,
        timezoneOffsetMinutes: 900,
      }),
    ).toThrow(ReceiptParserContextValidationError);
  });

  it('returns defensive candidate and bounding-box copies', () => {
    const parser = new DeterministicReceiptParser();
    const first = runReceiptParser(parser, makeOutput(['SHOP', 'TOTAL $5.00']), context);
    const second = runReceiptParser(parser, makeOutput(['SHOP', 'TOTAL $5.00']), context);

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first[0]?.boundingBox).not.toBe(second[0]?.boundingBox);
  });
});

function makeOutput(lines: readonly string[]): OcrOutput {
  return {
    pages: [
      {
        blocks: lines.map((text, index) => ({
          boundingBox: { ...box, y: box.y + index * 0.06 },
          confidence: 0.96,
          text,
        })),
        pageNumber: 1,
        text: lines.join('\n'),
      },
    ],
  };
}
