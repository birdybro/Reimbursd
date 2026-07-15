// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptDocumentRepository, ReceiptRepository } from '@reimbursd/database';
import type { Receipt, ReceiptDocument } from '@reimbursd/domain';
import { describe, expect, it, vi, type Mocked } from 'vitest';

import type { AttachmentStorage } from './attachment-ingestor.js';
import { ReceiptDeletionCoordinator } from './receipt-deletion.js';

const deletedAt = '2026-07-15T03:00:00.000Z';
const receipt = {
  id: '11111111-1111-4111-8111-111111111111',
  version: 1,
} as Receipt;
const document = {
  id: '22222222-2222-4222-8222-222222222222',
  receiptId: receipt.id,
  storageDeletedAt: null,
  storageReference: `receipt-documents/${receipt.id}/originals/22222222-2222-4222-8222-222222222222.png`,
} as ReceiptDocument;

describe('receipt attachment deletion', () => {
  it('tombstones the receipt before deleting and records successful byte removal', async () => {
    const events: string[] = [];
    const documents = createDocumentRepository([document], events);
    const receipts = createReceiptRepository(events);
    const storage = createStorage(events);
    const coordinator = new ReceiptDeletionCoordinator({
      documents,
      now: () => deletedAt,
      receipts,
      storage,
    });

    const result = await coordinator.deleteReceipt(receipt.id, receipt.version, deletedAt);

    expect(result.attachmentCleanupFailures).toEqual([]);
    expect(events).toEqual(['list documents', 'tombstone receipt', 'delete bytes', 'mark deleted']);
    expect(documents.markStorageDeleted).toHaveBeenCalledWith(document.id, deletedAt);
  });

  it('does not remove bytes when the receipt tombstone fails', async () => {
    const documents = createDocumentRepository([document]);
    const receipts = createReceiptRepository();
    receipts.delete.mockRejectedValue(new Error('Synthetic tombstone failure.'));
    const storage = createStorage();
    const coordinator = new ReceiptDeletionCoordinator({ documents, receipts, storage });

    await expect(coordinator.deleteReceipt(receipt.id, receipt.version, deletedAt)).rejects.toThrow(
      'Synthetic tombstone failure.',
    );
    expect(storage.delete).not.toHaveBeenCalled();
  });

  it('reports failed byte deletion and succeeds when pending cleanup is retried', async () => {
    const documents = createDocumentRepository([document]);
    documents.listPendingStorageDeletion.mockResolvedValue([document]);
    const receipts = createReceiptRepository();
    const storage = createStorage();
    storage.delete.mockRejectedValueOnce(new Error('Synthetic storage failure.'));
    const coordinator = new ReceiptDeletionCoordinator({
      documents,
      now: () => deletedAt,
      receipts,
      storage,
    });

    const firstResult = await coordinator.deleteReceipt(receipt.id, receipt.version, deletedAt);

    expect(firstResult.attachmentCleanupFailures).toMatchObject([{ document }]);
    expect(documents.markStorageDeleted).not.toHaveBeenCalled();

    await expect(coordinator.cleanupPending()).resolves.toEqual([]);
    expect(storage.delete).toHaveBeenCalledTimes(2);
    expect(documents.markStorageDeleted).toHaveBeenCalledWith(document.id, deletedAt);
  });
});

function createDocumentRepository(
  documents: readonly ReceiptDocument[],
  events: string[] = [],
): Mocked<ReceiptDocumentRepository> {
  return {
    create: vi.fn<ReceiptDocumentRepository['create']>(),
    findOriginalByHash: vi.fn<ReceiptDocumentRepository['findOriginalByHash']>(),
    getById: vi.fn<ReceiptDocumentRepository['getById']>(),
    listByReceiptId: vi.fn<ReceiptDocumentRepository['listByReceiptId']>(async () => {
      events.push('list documents');
      return documents;
    }),
    listPendingStorageDeletion: vi.fn<ReceiptDocumentRepository['listPendingStorageDeletion']>(),
    markStorageDeleted: vi.fn<ReceiptDocumentRepository['markStorageDeleted']>(
      async (_id, storageDeletedAt) => {
        events.push('mark deleted');
        return { ...document, storageDeletedAt };
      },
    ),
  };
}

function createReceiptRepository(events: string[] = []): Mocked<ReceiptRepository> {
  return {
    create: vi.fn<ReceiptRepository['create']>(),
    delete: vi.fn<ReceiptRepository['delete']>(async () => {
      events.push('tombstone receipt');
      return { ...receipt, deletedAt, version: 2 };
    }),
    getById: vi.fn<ReceiptRepository['getById']>(),
    list: vi.fn<ReceiptRepository['list']>(),
    update: vi.fn<ReceiptRepository['update']>(),
  };
}

function createStorage(events: string[] = []): Mocked<AttachmentStorage> {
  return {
    delete: vi.fn<AttachmentStorage['delete']>(async () => {
      events.push('delete bytes');
    }),
    writeOnce: vi.fn<AttachmentStorage['writeOnce']>(),
  };
}
