// SPDX-License-Identifier: GPL-3.0-only
import type { AttachmentInspector } from '@reimbursd/attachments';
import type { ReceiptDocument } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';
import {
  HostedAttachmentIntegrityError,
  HostedAttachmentService,
} from './hosted-attachment-service.js';
import {
  HostedReceiptDocumentDuplicateError,
  type HostedReceiptDocumentRepository,
} from './hosted-receipt-document-repository.js';
import type { HostedObjectStorage } from './object-storage.js';

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const receiptId = '10000000-0000-4000-8000-000000000001';
const documentId = '30000000-0000-4000-8000-000000000001';
const bytes = Uint8Array.from([1, 2, 3, 4]);

class FakeDocuments implements HostedReceiptDocumentRepository {
  readonly documents = new Map<string, { document: ReceiptDocument; ownerId: string }>();
  createError: Error | null = null;

  async createForOwner(ownerId: string, document: ReceiptDocument): Promise<ReceiptDocument> {
    if (this.createError) {
      throw this.createError;
    }

    this.documents.set(document.id, { document: { ...document }, ownerId });
    return { ...document };
  }

  async findOriginalByHashForOwner(
    ownerId: string,
    sha256: string,
  ): Promise<ReceiptDocument | null> {
    const match = [...this.documents.values()].find(
      (stored) => stored.ownerId === ownerId && stored.document.sha256 === sha256,
    );
    return match ? { ...match.document } : null;
  }

  async getByIdForOwner(
    ownerId: string,
    requestedReceiptId: string,
    requestedDocumentId: string,
  ): Promise<ReceiptDocument | null> {
    const stored = this.documents.get(requestedDocumentId);
    return stored?.ownerId === ownerId && stored.document.receiptId === requestedReceiptId
      ? { ...stored.document }
      : null;
  }
}

class FakeStorage implements HostedObjectStorage {
  deleteError: Error | null = null;
  readCount = 0;
  readonly objects = new Map<string, Uint8Array>();

  async assertReady(): Promise<void> {}

  async delete(storageReference: string): Promise<void> {
    if (this.deleteError) {
      throw this.deleteError;
    }

    this.objects.delete(storageReference);
  }

  async read(storageReference: string): Promise<Uint8Array> {
    this.readCount += 1;
    const stored = this.objects.get(storageReference);

    if (!stored) {
      throw new Error('Synthetic object is missing.');
    }

    return stored.slice();
  }

  async writeOnce(storageReference: string, value: Uint8Array): Promise<void> {
    this.objects.set(storageReference, value.slice());
  }
}

const inspector: AttachmentInspector = {
  async inspect() {
    return { heightPixels: 1, mimeType: 'image/png', pageCount: 1, widthPixels: 1 };
  },
};

function createService(documents = new FakeDocuments(), storage = new FakeStorage()) {
  return {
    documents,
    service: new HostedAttachmentService({
      clock: () => new Date('2026-07-18T18:00:00.000Z'),
      documents,
      inspector,
      storage,
    }),
    storage,
  };
}

async function upload(service: HostedAttachmentService): Promise<ReceiptDocument> {
  return service.upload({
    bytes,
    documentId,
    originalFilename: 'synthetic.png',
    ownerId: ownerA,
    receiptId,
    sourceType: 'image_import',
  });
}

describe('HostedAttachmentService', () => {
  it('writes an immutable owner-derived key and metadata', async () => {
    const { service, storage } = createService();
    const document = await upload(service);

    expect(document.storageReference).toBe(
      `owners/${ownerA}/receipts/${receiptId}/originals/${documentId}.png`,
    );
    expect(document.sha256).toBe(
      '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
    );
    expect(storage.objects.get(document.storageReference)).toEqual(bytes);
  });

  it('rejects invalid ownership identifiers before inspection or storage', async () => {
    const context = createService();

    await expect(
      context.service.upload({
        bytes,
        documentId,
        originalFilename: 'synthetic.png',
        ownerId: '../another-owner',
        receiptId,
        sourceType: 'image_import',
      }),
    ).rejects.toThrow('Owner ID must be a UUID.');
    expect(context.storage.objects.size).toBe(0);
  });

  it('rejects a duplicate before another object write', async () => {
    const context = createService();
    await upload(context.service);

    await expect(upload(context.service)).rejects.toBeInstanceOf(
      HostedReceiptDocumentDuplicateError,
    );
    expect(context.storage.objects.size).toBe(1);
  });

  it('removes the object when metadata persistence fails', async () => {
    const documents = new FakeDocuments();
    documents.createError = new Error('Synthetic metadata failure.');
    const { service, storage } = createService(documents);

    await expect(upload(service)).rejects.toThrow('Synthetic metadata failure.');
    expect(storage.objects.size).toBe(0);
  });

  it('reports both metadata and cleanup failure', async () => {
    const documents = new FakeDocuments();
    const storage = new FakeStorage();
    documents.createError = new Error('Synthetic metadata failure.');
    storage.deleteError = new Error('Synthetic cleanup failure.');
    const { service } = createService(documents, storage);

    await expect(upload(service)).rejects.toBeInstanceOf(AggregateError);
  });

  it('does not read object storage when owner metadata is unavailable', async () => {
    const { service, storage } = createService();
    await upload(service);

    await expect(service.download(ownerB, receiptId, documentId)).resolves.toBeNull();
    expect(storage.readCount).toBe(0);
  });

  it('fails closed when downloaded bytes do not match metadata', async () => {
    const { service, storage } = createService();
    const document = await upload(service);
    storage.objects.set(document.storageReference, Uint8Array.from([9, 9, 9, 9]));

    await expect(service.download(ownerA, receiptId, documentId)).rejects.toBeInstanceOf(
      HostedAttachmentIntegrityError,
    );
  });
});
