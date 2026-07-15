// SPDX-License-Identifier: GPL-3.0-only
import type { IngestOriginalAttachmentInput } from '@reimbursd/attachments';
import type { ReceiptRepository } from '@reimbursd/database';
import type { ReceiptDocument } from '@reimbursd/domain';

import { ReceiptCaptureCoordinator } from '../receipt-capture';

jest.mock('@reimbursd/attachments', () => ({
  AttachmentDuplicateError: class AttachmentDuplicateError extends Error {},
  AttachmentInspectionError: class AttachmentInspectionError extends Error {},
  AttachmentLimitError: class AttachmentLimitError extends Error {},
  defaultAttachmentLimits: { maximumByteSize: 25 * 1024 * 1024 },
}));

jest.mock('expo-crypto', () => ({ randomUUID: jest.fn() }));
jest.mock('../../../storage/local-attachments', () => ({
  readPickedLocalFile: jest.fn(),
}));

const mockReadPickedLocalFile = jest.requireMock('../../../storage/local-attachments')
  .readPickedLocalFile as jest.Mock;
const mockRandomUUID = jest.requireMock('expo-crypto').randomUUID as jest.Mock;

function createReceiptRepository(): jest.Mocked<ReceiptRepository> {
  return {
    create: jest.fn(async (receipt) => receipt),
    delete: jest.fn(),
    getById: jest.fn(),
    list: jest.fn(),
    update: jest.fn(),
  };
}

describe('receipt capture coordinator', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    mockReadPickedLocalFile.mockReset().mockResolvedValue(Uint8Array.from([1, 2, 3]));
    mockRandomUUID
      .mockReset()
      .mockReturnValueOnce('11111111-1111-4111-8111-111111111111')
      .mockReturnValueOnce('22222222-2222-4222-8222-222222222222')
      .mockReturnValueOnce('33333333-3333-4333-8333-333333333333');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('creates a local review record and preserves the selected original', async () => {
    const receipts = createReceiptRepository();
    const ingestOriginal = jest.fn(
      async (input: IngestOriginalAttachmentInput): Promise<ReceiptDocument> => ({
        byteSize: input.bytes.byteLength,
        createdAt: input.createdAt,
        heightPixels: 20,
        id: input.documentId,
        isOriginal: true,
        mimeType: 'image/png',
        originalFilename: input.originalFilename,
        pageCount: 1,
        parentDocumentId: null,
        receiptId: input.receiptId,
        sha256: 'd'.repeat(64),
        sourceType: input.sourceType,
        storageDeletedAt: null,
        storageReference: 'receipt-documents/reference.png',
        widthPixels: 10,
      }),
    );
    const coordinator = new ReceiptCaptureCoordinator({ ingestor: { ingestOriginal }, receipts });

    const imported = await coordinator.import({
      originalFilename: 'synthetic-receipt.png',
      reportedByteSize: 3,
      sourceType: 'image_import',
      uri: 'file:///synthetic-receipt.png',
    });

    expect(imported.receipt).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      merchantName: 'Receipt to review',
      totalMinor: 0,
    });
    expect(receipts.create).toHaveBeenCalledWith(imported.receipt);
    expect(ingestOriginal).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Uint8Array.from([1, 2, 3]),
        documentId: '33333333-3333-4333-8333-333333333333',
        receiptId: imported.receipt.id,
        sourceType: 'image_import',
      }),
    );
  });

  test('tombstones an empty review record when attachment ingestion fails', async () => {
    const receipts = createReceiptRepository();
    receipts.delete.mockImplementation(async (id, version, deletedAt) => {
      const created = receipts.create.mock.calls[0]?.[0];

      if (created === undefined) {
        throw new Error('Expected a created receipt.');
      }

      return { ...created, deletedAt, id, version: version + 1 };
    });
    const coordinator = new ReceiptCaptureCoordinator({
      ingestor: { ingestOriginal: jest.fn().mockRejectedValue(new Error('Synthetic failure.')) },
      receipts,
    });

    await expect(
      coordinator.import({
        originalFilename: 'synthetic-receipt.png',
        sourceType: 'image_import',
        uri: 'file:///synthetic-receipt.png',
      }),
    ).rejects.toThrow('Synthetic failure.');
    expect(receipts.delete).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringMatching(/^2026-07-15T12:00:00\.000Z$/),
    );
  });
});
