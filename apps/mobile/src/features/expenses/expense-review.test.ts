// SPDX-License-Identifier: GPL-3.0-only
import { createManualReceipt, type EvidenceFieldName, type FieldEvidence } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';

import { buildReceiptReviewInput, receiptToReviewExpenseForm } from './expense-review';

const receipt = createManualReceipt({
  capturedAt: '2026-07-15T12:00:00.000Z',
  currencyCode: 'USD',
  id: '11111111-1111-4111-8111-111111111111',
  merchantId: '22222222-2222-4222-8222-222222222222',
  merchantName: 'Receipt to review',
  purchasedAt: '2026-07-15T12:00:00-06:00',
  subtotalMinor: 0,
  taxMinor: 0,
  tipMinor: 0,
  totalMinor: 0,
});

describe('expense evidence review', () => {
  it('prefills the edit form from normalized suggestions', () => {
    const suggestions = [
      makeEvidence('merchant_name', 'Corner Market'),
      makeEvidence('purchased_at', '2026-07-14T12:00:00-06:00'),
      makeEvidence('currency_code', 'CAD'),
      makeEvidence('subtotal_minor', '1000'),
      makeEvidence('tax_minor', '80'),
      makeEvidence('total_minor', '1080'),
    ];

    expect(receiptToReviewExpenseForm(receipt, suggestions)).toMatchObject({
      currencyCode: 'CAD',
      merchantName: 'Corner Market',
      purchaseDate: '2026-07-14',
      subtotal: '10.00',
      tax: '0.80',
      total: '10.80',
    });
  });

  it('accepts matching suggestions and records corrected values with user authority', () => {
    const suggestions = [
      makeEvidence('merchant_name', 'Corner Market'),
      makeEvidence('subtotal_minor', '1000'),
      makeEvidence('tax_minor', '80'),
      makeEvidence('total_minor', '1080'),
    ];
    let nextId = 10;
    const review = buildReceiptReviewInput({
      idFactory: () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`,
      processingHistoryIds: ['99999999-9999-4999-8999-999999999999'],
      receipt,
      suggestions,
      update: {
        currencyCode: 'USD',
        discountMinor: 0,
        expectedVersion: 1,
        id: receipt.id,
        merchantId: '33333333-3333-4333-8333-333333333333',
        merchantName: 'Corner Market',
        notes: '',
        purchasedAt: receipt.purchasedAt,
        subtotalMinor: 1_000,
        taxMinor: 100,
        tipMinor: 0,
        totalMinor: 1_100,
        updatedAt: '2026-07-15T12:05:00.000Z',
      },
    });

    expect(review.evidenceReviews.map(({ status }) => status)).toEqual([
      'accepted',
      'accepted',
      'corrected',
      'corrected',
    ]);
    expect(review.corrections).toMatchObject([
      {
        confidence: 1,
        correctedAt: '2026-07-15T12:05:00.000Z',
        fieldName: 'tax_minor',
        normalizedValue: '100',
        sourceType: 'user_correction',
      },
      {
        confidence: 1,
        correctedAt: '2026-07-15T12:05:00.000Z',
        fieldName: 'total_minor',
        normalizedValue: '1100',
        sourceType: 'user_correction',
      },
    ]);
  });

  it('records ordinary edits even when no automated suggestion exists', () => {
    const review = buildReceiptReviewInput({
      idFactory: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      processingHistoryIds: [],
      receipt,
      suggestions: [],
      update: {
        currencyCode: receipt.currencyCode,
        discountMinor: receipt.discountMinor,
        expectedVersion: receipt.version,
        id: receipt.id,
        merchantId: '33333333-3333-4333-8333-333333333333',
        merchantName: 'Corrected merchant',
        notes: receipt.notes,
        purchasedAt: receipt.purchasedAt,
        subtotalMinor: receipt.subtotalMinor,
        taxMinor: receipt.taxMinor,
        tipMinor: receipt.tipMinor,
        totalMinor: receipt.totalMinor,
        updatedAt: '2026-07-15T12:05:00.000Z',
      },
    });

    expect(review.evidenceReviews).toEqual([]);
    expect(review.corrections).toMatchObject([
      {
        fieldName: 'merchant_name',
        normalizedValue: 'Corrected merchant',
        sourceType: 'user_correction',
      },
    ]);
  });
});

function makeEvidence(fieldName: EvidenceFieldName, normalizedValue: string): FieldEvidence {
  return {
    acceptedAt: null,
    boundingBox: null,
    confidence: 0.9,
    correctedAt: null,
    extractedValue: normalizedValue,
    fieldName,
    id: `00000000-0000-4000-8000-${String(fieldName.length).padStart(12, '0')}`,
    normalizedValue,
    pageNumber: null,
    processedAt: '2026-07-15T12:01:00.000Z',
    processorName: 'reimbursd-deterministic-parser',
    processorVersion: '1.0.0',
    receiptId: receipt.id,
    sourceType: 'deterministic_parser',
  };
}
