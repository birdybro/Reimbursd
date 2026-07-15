// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  assertValidFieldEvidence,
  assertValidProcessingHistory,
  canSupersedeFieldEvidence,
  validateFieldEvidence,
  validateProcessingHistory,
  type FieldEvidence,
  type ProcessingHistory,
} from './processing.js';

const processedAt = '2026-07-15T06:00:00.000Z';
const evidence: FieldEvidence = {
  acceptedAt: null,
  boundingBox: { height: 0.04, width: 0.18, x: 0.7, y: 0.82 },
  confidence: 0.94,
  correctedAt: null,
  extractedValue: '$13.34',
  fieldName: 'total_minor',
  id: '11111111-1111-4111-8111-111111111111',
  normalizedValue: '1334',
  pageNumber: 1,
  processedAt,
  processorName: 'deterministic-receipt-parser',
  processorVersion: '1.0.0',
  receiptId: '22222222-2222-4222-8222-222222222222',
  sourceType: 'deterministic_parser',
};
const history: ProcessingHistory = {
  affectedFields: ['total_minor'],
  completedAt: '2026-07-15T06:00:01.000Z',
  executionLocation: 'local',
  failureCode: null,
  id: '33333333-3333-4333-8333-333333333333',
  modelVersion: null,
  processorName: 'deterministic-receipt-parser',
  processorVersion: '1.0.0',
  providerName: 'reimbursd-local',
  receiptId: evidence.receiptId,
  reviewStatus: 'pending',
  startedAt: processedAt,
  status: 'succeeded',
};

describe('field evidence', () => {
  it('accepts bounded provenance with normalized page coordinates', () => {
    expect(validateFieldEvidence(evidence)).toEqual([]);
    expect(() => assertValidFieldEvidence(evidence)).not.toThrow();
  });

  it('rejects out-of-page bounds, invalid confidence, and unlocated boxes', () => {
    const issues = validateFieldEvidence({
      ...evidence,
      boundingBox: { height: 0.3, width: 0.4, x: 0.8, y: 0.8 },
      confidence: 1.1,
      pageNumber: null,
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'boundingBox' }),
        expect.objectContaining({ field: 'confidence' }),
        expect.objectContaining({ field: 'pageNumber' }),
      ]),
    );
  });

  it('keeps accepted and corrected values authoritative over later automation', () => {
    const accepted = { ...evidence, acceptedAt: '2026-07-15T06:01:00.000Z' };
    const laterAutomated = {
      ...evidence,
      id: '44444444-4444-4444-8444-444444444444',
      processedAt: '2026-07-15T06:02:00.000Z',
    };
    const correction: FieldEvidence = {
      ...laterAutomated,
      correctedAt: '2026-07-15T06:03:00.000Z',
      id: '55555555-5555-4555-8555-555555555555',
      sourceType: 'user_correction',
    };

    expect(canSupersedeFieldEvidence(laterAutomated, accepted)).toBe(false);
    expect(canSupersedeFieldEvidence(correction, accepted)).toBe(true);
    expect(canSupersedeFieldEvidence(laterAutomated, correction)).toBe(false);
  });

  it('rejects precedence comparisons across different fields', () => {
    expect(() =>
      canSupersedeFieldEvidence({ ...evidence, fieldName: 'tax_minor' }, evidence),
    ).toThrow('Evidence precedence requires the same receipt and field.');
  });
});

describe('processing history', () => {
  it('accepts completed local processing with a pending review', () => {
    expect(validateProcessingHistory(history)).toEqual([]);
    expect(() => assertValidProcessingHistory(history)).not.toThrow();
  });

  it('requires completion and redacted failure lifecycle fields', () => {
    const issues = validateProcessingHistory({
      ...history,
      completedAt: null,
      failureCode: 'Receipt total was $13.34',
      reviewStatus: 'accepted',
      status: 'failed',
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'completedAt' }),
        expect.objectContaining({ field: 'failureCode' }),
        expect.objectContaining({ field: 'reviewStatus' }),
      ]),
    );
  });

  it('allows a running attempt only without completion or failure fields', () => {
    expect(
      validateProcessingHistory({
        ...history,
        affectedFields: [],
        completedAt: null,
        reviewStatus: 'not_applicable',
        status: 'running',
      }),
    ).toEqual([]);
  });
});
