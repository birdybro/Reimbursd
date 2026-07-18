// SPDX-License-Identifier: GPL-3.0-only
import { StructuredImportTargetNotEmptyError } from '@reimbursd/database';
import { parseStructuredExport, StructuredExportValidationError } from '@reimbursd/export';
import type { StructuredExportRecords } from '@reimbursd/export';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getStructuredRestoreErrorMessage,
  restoreStructuredData,
  StructuredRestoreMissingAttachmentsError,
  StructuredRestoreStorageConflictError,
} from './structured-restore.js';

vi.mock('@reimbursd/export', async (importOriginal) => {
  const original = await importOriginal<typeof import('@reimbursd/export')>();
  return { ...original, parseStructuredExport: vi.fn() };
});

const storageReference =
  'receipt-documents/22222222-2222-4222-8222-222222222222/originals/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png';
const documentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const attachmentBytes = Uint8Array.from([1, 2, 3, 4]);
const records: StructuredExportRecords = {
  categories: [],
  fieldEvidence: [],
  merchants: [],
  processingHistory: [],
  receiptDocuments: [
    {
      byteSize: 4,
      createdAt: '2026-07-18T13:00:00.000Z',
      heightPixels: 1,
      id: documentId,
      isOriginal: true,
      mimeType: 'image/png',
      originalFilename: 'receipt.png',
      pageCount: 1,
      parentDocumentId: null,
      receiptId: '22222222-2222-4222-8222-222222222222',
      sha256: 'a'.repeat(64),
      sourceType: 'image_import',
      storageDeletedAt: null,
      storageReference,
      widthPixels: 1,
    },
  ],
  receiptTags: [],
  receipts: [],
  tags: [],
};

describe('mobile structured restore coordinator', () => {
  beforeEach(() => {
    vi.mocked(parseStructuredExport)
      .mockReset()
      .mockResolvedValue({
        attachments: [{ bytes: attachmentBytes, documentId }],
        manifest: {
          applicationVersion: '0.1.0',
          createdAt: '2026-07-18T13:00:00.000Z',
          files: [],
          format: 'reimbursd-export',
          formatVersion: 1,
          includesOriginalAttachments: true,
          schemaVersion: 6,
        },
        records,
      });
  });

  it('writes verified originals before committing the structured database restore', async () => {
    const calls: string[] = [];
    const repository = {
      restoreClean: vi.fn().mockImplementation(() => {
        calls.push('database');
        return Promise.resolve(result());
      }),
    };
    const storage = {
      delete: vi.fn(),
      read: vi.fn(),
      writeOnce: vi.fn().mockImplementation(() => {
        calls.push('attachment');
        return Promise.resolve();
      }),
    };

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository,
        storage,
        supportedSchemaVersion: 6,
      }),
    ).resolves.toEqual(result());
    expect(calls).toEqual(['attachment', 'database']);
    expect(storage.writeOnce).toHaveBeenCalledWith(storageReference, attachmentBytes);
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('removes newly written originals when the database transaction fails', async () => {
    const storage = {
      delete: vi.fn().mockResolvedValue(undefined),
      read: vi.fn(),
      writeOnce: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository: {
          restoreClean: vi.fn().mockRejectedValue(new Error('synthetic database failure')),
        },
        storage,
        supportedSchemaVersion: 6,
      }),
    ).rejects.toThrow('synthetic database failure');
    expect(storage.delete).toHaveBeenCalledWith(storageReference);
  });

  it('reports incomplete compensating cleanup as a recoverable aggregate failure', async () => {
    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository: {
          restoreClean: vi.fn().mockRejectedValue(new Error('synthetic database failure')),
        },
        storage: {
          delete: vi.fn().mockRejectedValue(new Error('synthetic cleanup failure')),
          read: vi.fn(),
          writeOnce: vi.fn().mockResolvedValue(undefined),
        },
        supportedSchemaVersion: 6,
      }),
    ).rejects.toBeInstanceOf(AggregateError);
  });

  it('reuses identical orphan bytes after interrupted cleanup and rejects conflicts', async () => {
    const repository = { restoreClean: vi.fn().mockResolvedValue(result()) };
    const identicalStorage = {
      delete: vi.fn(),
      read: vi.fn().mockResolvedValue(attachmentBytes),
      writeOnce: vi.fn().mockRejectedValue(new Error('already exists')),
    };

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository,
        storage: identicalStorage,
        supportedSchemaVersion: 6,
      }),
    ).resolves.toEqual(result());
    expect(identicalStorage.delete).not.toHaveBeenCalled();

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository,
        storage: {
          ...identicalStorage,
          read: vi.fn().mockResolvedValue(Uint8Array.from([4, 3, 2, 1])),
        },
        supportedSchemaVersion: 6,
      }),
    ).rejects.toBeInstanceOf(StructuredRestoreStorageConflictError);
  });

  it('rejects record-only exports before writing any database or attachment data', async () => {
    vi.mocked(parseStructuredExport).mockResolvedValue({
      attachments: [],
      manifest: {
        applicationVersion: '0.1.0',
        createdAt: '2026-07-18T13:00:00.000Z',
        files: [],
        format: 'reimbursd-export',
        formatVersion: 1,
        includesOriginalAttachments: false,
        schemaVersion: 6,
      },
      records,
    });
    const repository = { restoreClean: vi.fn() };
    const storage = { delete: vi.fn(), read: vi.fn(), writeOnce: vi.fn() };

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository,
        storage,
        supportedSchemaVersion: 6,
      }),
    ).rejects.toBeInstanceOf(StructuredRestoreMissingAttachmentsError);
    expect(storage.writeOnce).not.toHaveBeenCalled();
    expect(repository.restoreClean).not.toHaveBeenCalled();
  });

  it('rejects a noncanonical mobile storage target before any local write', async () => {
    vi.mocked(parseStructuredExport).mockResolvedValue({
      attachments: [{ bytes: attachmentBytes, documentId }],
      manifest: {
        applicationVersion: '0.1.0',
        createdAt: '2026-07-18T13:00:00.000Z',
        files: [],
        format: 'reimbursd-export',
        formatVersion: 1,
        includesOriginalAttachments: true,
        schemaVersion: 6,
      },
      records: {
        ...records,
        receiptDocuments: [
          { ...records.receiptDocuments[0]!, storageReference: 'receipt-documents/wrong.png' },
        ],
      },
    });
    const repository = { restoreClean: vi.fn() };
    const storage = { delete: vi.fn(), read: vi.fn(), writeOnce: vi.fn() };

    await expect(
      restoreStructuredData({
        bytes: Uint8Array.from([80, 75]),
        hasher: { sha256: vi.fn() },
        repository,
        storage,
        supportedSchemaVersion: 6,
      }),
    ).rejects.toBeInstanceOf(StructuredExportValidationError);
    expect(storage.writeOnce).not.toHaveBeenCalled();
    expect(repository.restoreClean).not.toHaveBeenCalled();
  });

  it('maps known restore failures to actionable messages without exposing raw errors', () => {
    expect(getStructuredRestoreErrorMessage(new StructuredImportTargetNotEmptyError())).toContain(
      'empty local database',
    );
    expect(
      getStructuredRestoreErrorMessage(new StructuredExportValidationError('private detail')),
    ).toBe('The selected file is not a valid supported Reimbursd export.');
    expect(getStructuredRestoreErrorMessage(new AggregateError([]))).toContain(
      'cleanup was incomplete',
    );
    expect(getStructuredRestoreErrorMessage(new Error('private detail'))).not.toContain(
      'private detail',
    );
  });
});

function result() {
  return {
    attachmentDocumentCount: 1,
    categoryCount: 0,
    evidenceCount: 0,
    processingHistoryCount: 0,
    receiptCount: 0,
    tagCount: 0,
  };
}
