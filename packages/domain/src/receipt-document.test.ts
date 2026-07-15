// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  isReceiptDocumentMimeType,
  validateReceiptDocument,
  type ReceiptDocument,
} from './receipt-document.js';

const validDocument: ReceiptDocument = {
  byteSize: 12_345,
  createdAt: '2026-07-15T01:00:00.000Z',
  heightPixels: 2_400,
  id: '0ad845cb-2616-46e2-9ea7-baf9c480e283',
  isOriginal: true,
  mimeType: 'image/jpeg',
  originalFilename: 'receipt.jpg',
  pageCount: 1,
  parentDocumentId: null,
  receiptId: 'b1c535d8-7295-46ac-aa11-c09ea335e8f4',
  sha256: 'd'.repeat(64),
  sourceType: 'image_import',
  storageDeletedAt: null,
  storageReference: 'receipts/b1c535d8/originals/0ad845cb.jpg',
  widthPixels: 1_800,
};

describe('receipt document validation', () => {
  it('accepts supported original image metadata', () => {
    expect(validateReceiptDocument(validDocument)).toEqual([]);
  });

  it('accepts multi-page PDF metadata without whole-document dimensions', () => {
    expect(
      validateReceiptDocument({
        ...validDocument,
        heightPixels: null,
        mimeType: 'application/pdf',
        originalFilename: 'receipt.pdf',
        pageCount: 4,
        sourceType: 'pdf_import',
        widthPixels: null,
      }),
    ).toEqual([]);
  });

  it('requires derivatives to identify their original parent', () => {
    expect(
      validateReceiptDocument({
        ...validDocument,
        isOriginal: false,
        sourceType: 'derivative',
      }).map(({ field }) => field),
    ).toContain('parentDocumentId');
  });

  it('rejects unsafe metadata and invalid integrity values', () => {
    const fields = validateReceiptDocument({
      ...validDocument,
      byteSize: 0,
      originalFilename: 'receipt\u0000.jpg',
      sha256: 'ABC',
      storageReference: '',
    }).map(({ field }) => field);

    expect(fields).toEqual(
      expect.arrayContaining(['byteSize', 'originalFilename', 'sha256', 'storageReference']),
    );
  });

  it('recognizes only supported document MIME types', () => {
    expect(isReceiptDocumentMimeType('image/png')).toBe(true);
    expect(isReceiptDocumentMimeType('image/svg+xml')).toBe(false);
  });
});
