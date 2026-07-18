// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptDocument } from '@reimbursd/domain';
import { createStructuredExport, type StructuredExportRecords } from '@reimbursd/export';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportStructuredData } from './structured-export.js';

vi.mock('@reimbursd/export', async (importOriginal) => {
  const original = await importOriginal<typeof import('@reimbursd/export')>();
  return { ...original, createStructuredExport: vi.fn() };
});

const document: ReceiptDocument = {
  byteSize: 4,
  createdAt: '2026-07-18T13:00:00.000Z',
  heightPixels: 1,
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  isOriginal: true,
  mimeType: 'image/png',
  originalFilename: 'receipt.png',
  pageCount: 1,
  parentDocumentId: null,
  receiptId: '22222222-2222-4222-8222-222222222222',
  sha256: 'a'.repeat(64),
  sourceType: 'image_import',
  storageDeletedAt: null,
  storageReference:
    'receipt-documents/22222222-2222-4222-8222-222222222222/originals/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png',
  widthPixels: 1,
};
const records: StructuredExportRecords = {
  categories: [],
  fieldEvidence: [],
  merchants: [],
  processingHistory: [],
  receiptDocuments: [document],
  receiptTags: [],
  receipts: [],
  tags: [],
};
const bytes = Uint8Array.from([1, 2, 3, 4]);

describe('mobile structured export coordinator', () => {
  beforeEach(() => {
    vi.mocked(createStructuredExport)
      .mockReset()
      .mockResolvedValue({
        bytes: Uint8Array.from([80, 75]),
        filename: 'reimbursd-export-2026-07-18.zip',
        manifest: {
          applicationVersion: '0.1.0',
          createdAt: '2026-07-18T13:00:00.000Z',
          files: [],
          format: 'reimbursd-export',
          formatVersion: 1,
          includesOriginalAttachments: true,
          schemaVersion: 6,
        },
      });
  });

  it('reads originals before creating and saving the complete archive', async () => {
    const repository = { getActiveSnapshot: vi.fn().mockResolvedValue(records) };
    const storage = { read: vi.fn().mockResolvedValue(bytes) };
    const writer = { save: vi.fn().mockResolvedValue(undefined) };

    const result = await exportStructuredData({
      applicationVersion: '0.1.0',
      hasher: { sha256: vi.fn().mockResolvedValue('a'.repeat(64)) },
      includeOriginalAttachments: true,
      now: () => new Date('2026-07-18T13:00:00.000Z'),
      repository,
      schemaVersion: 6,
      storage,
      writer,
    });

    expect(storage.read).toHaveBeenCalledWith(document.storageReference);
    expect(createStructuredExport).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [{ bytes, documentId: document.id }],
        createdAt: '2026-07-18T13:00:00.000Z',
        includeOriginalAttachments: true,
        records,
      }),
    );
    expect(writer.save).toHaveBeenCalledWith({
      bytes: Uint8Array.from([80, 75]),
      filename: 'reimbursd-export-2026-07-18.zip',
    });
    expect(result).toEqual({
      attachmentCount: 1,
      filename: 'reimbursd-export-2026-07-18.zip',
      receiptCount: 0,
    });
  });

  it('skips original reads when excluded and propagates archive write failures', async () => {
    const storage = { read: vi.fn() };
    const writer = { save: vi.fn().mockRejectedValue(new Error('synthetic write failure')) };

    await expect(
      exportStructuredData({
        applicationVersion: '0.1.0',
        hasher: { sha256: vi.fn().mockResolvedValue('a'.repeat(64)) },
        includeOriginalAttachments: false,
        repository: { getActiveSnapshot: vi.fn().mockResolvedValue(records) },
        schemaVersion: 6,
        storage,
        writer,
      }),
    ).rejects.toThrow('synthetic write failure');
    expect(storage.read).not.toHaveBeenCalled();
    expect(createStructuredExport).toHaveBeenLastCalledWith(
      expect.objectContaining({ attachments: [], includeOriginalAttachments: false }),
    );
  });
});
