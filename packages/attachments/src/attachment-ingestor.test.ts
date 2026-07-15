// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptDocument } from '@reimbursd/domain';
import type { ReceiptDocumentRepository } from '@reimbursd/database';
import { describe, expect, it } from 'vitest';

import {
  AttachmentDuplicateError,
  AttachmentIngestor,
  type AttachmentHasher,
  type AttachmentLimits,
  type AttachmentStorage,
} from './attachment-ingestor.js';
import type { AttachmentInspection, AttachmentInspector } from './content-inspector.js';

const receiptId = 'b1c535d8-7295-46ac-aa11-c09ea335e8f4';
const documentId = '0ad845cb-2616-46e2-9ea7-baf9c480e283';
const sha256 = 'd'.repeat(64);
const defaultInspection: AttachmentInspection = {
  heightPixels: 2_400,
  mimeType: 'image/jpeg',
  pageCount: 1,
  widthPixels: 1_800,
};
const strictLimits: AttachmentLimits = {
  maximumByteSize: 10,
  maximumImageDimension: 3_000,
  maximumImagePixels: 5_000_000,
  maximumPageCount: 3,
};

describe('original attachment ingestion', () => {
  it('validates, hashes, preserves bytes once, and then stores metadata', async () => {
    const documents = new MemoryDocumentRepository();
    const storage = new MemoryAttachmentStorage();
    const inputBytes = Uint8Array.from([1, 2, 3, 4]);
    const ingestor = makeIngestor({ documents, storage });

    const document = await ingestor.ingestOriginal(makeInput(inputBytes));
    inputBytes.fill(9);

    expect(document).toEqual({
      byteSize: 4,
      createdAt: '2026-07-15T01:00:00.000Z',
      heightPixels: 2_400,
      id: documentId,
      isOriginal: true,
      mimeType: 'image/jpeg',
      originalFilename: 'synthetic-receipt.jpg',
      pageCount: 1,
      parentDocumentId: null,
      receiptId,
      sha256,
      sourceType: 'image_import',
      storageReference: `receipt-documents/${receiptId}/originals/${documentId}.jpg`,
      widthPixels: 1_800,
    });
    expect(storage.read(document.storageReference)).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(documents.created).toEqual([document]);
  });

  it('detects duplicate content before writing another copy', async () => {
    const existing = makeDocument();
    const documents = new MemoryDocumentRepository([existing]);
    const storage = new MemoryAttachmentStorage();

    await expect(
      makeIngestor({ documents, storage }).ingestOriginal(makeInput()),
    ).rejects.toBeInstanceOf(AttachmentDuplicateError);
    expect(storage.writeCount).toBe(0);
  });

  it('rejects a picker source that does not match the validated content', async () => {
    const storage = new MemoryAttachmentStorage();
    const ingestor = makeIngestor({
      inspection: {
        heightPixels: null,
        mimeType: 'application/pdf',
        pageCount: 1,
        widthPixels: null,
      },
      storage,
    });

    await expect(ingestor.ingestOriginal(makeInput())).rejects.toThrow(
      'Attachment source does not match the validated file contents.',
    );
    expect(storage.writeCount).toBe(0);
  });

  it.each([
    {
      inspection: defaultInspection,
      inputBytes: Uint8Array.from({ length: 11 }, () => 1),
      limit: 'maximumByteSize',
    },
    {
      inspection: { ...defaultInspection, mimeType: 'application/pdf' as const, pageCount: 4 },
      inputBytes: Uint8Array.from([1]),
      limit: 'maximumPageCount',
      sourceType: 'pdf_import' as const,
    },
    {
      inspection: { ...defaultInspection, heightPixels: 3_001 },
      inputBytes: Uint8Array.from([1]),
      limit: 'maximumImageDimension',
    },
    {
      inspection: { ...defaultInspection, heightPixels: 2_500, widthPixels: 2_500 },
      inputBytes: Uint8Array.from([1]),
      limit: 'maximumImagePixels',
    },
  ])('rejects input beyond the $limit limit before storage', async (testCase) => {
    const storage = new MemoryAttachmentStorage();
    const ingestor = makeIngestor({ inspection: testCase.inspection, storage });

    await expect(
      ingestor.ingestOriginal(makeInput(testCase.inputBytes, testCase.sourceType)),
    ).rejects.toMatchObject({ limit: testCase.limit });
    expect(storage.writeCount).toBe(0);
  });

  it('removes preserved bytes when metadata persistence fails', async () => {
    const documents = new MemoryDocumentRepository();
    documents.createError = new Error('Synthetic database failure.');
    const storage = new MemoryAttachmentStorage();

    await expect(makeIngestor({ documents, storage }).ingestOriginal(makeInput())).rejects.toThrow(
      'Synthetic database failure.',
    );
    expect(storage.size).toBe(0);
    expect(storage.deleteCount).toBe(1);
  });

  it('reports both persistence and cleanup failures without hiding either error', async () => {
    const documents = new MemoryDocumentRepository();
    documents.createError = new Error('Synthetic database failure.');
    const storage = new MemoryAttachmentStorage();
    storage.deleteError = new Error('Synthetic cleanup failure.');

    await expect(
      makeIngestor({ documents, storage }).ingestOriginal(makeInput()),
    ).rejects.toBeInstanceOf(AggregateError);
  });

  it('rejects invalid configured limits at construction', () => {
    expect(() => makeIngestor({ limits: { ...strictLimits, maximumPageCount: 0 } })).toThrow(
      'maximumPageCount must be a positive safe integer.',
    );
  });
});

class StaticInspector implements AttachmentInspector {
  readonly #inspection: AttachmentInspection;

  constructor(inspection: AttachmentInspection) {
    this.#inspection = inspection;
  }

  async inspect(): Promise<AttachmentInspection> {
    return this.#inspection;
  }
}

class StaticHasher implements AttachmentHasher {
  async sha256(): Promise<string> {
    return sha256;
  }
}

class MemoryAttachmentStorage implements AttachmentStorage {
  deleteCount = 0;
  deleteError: Error | null = null;
  readonly #files = new Map<string, Uint8Array>();
  writeCount = 0;

  get size(): number {
    return this.#files.size;
  }

  async delete(storageReference: string): Promise<void> {
    this.deleteCount += 1;

    if (this.deleteError !== null) {
      throw this.deleteError;
    }

    this.#files.delete(storageReference);
  }

  read(storageReference: string): Uint8Array | undefined {
    return this.#files.get(storageReference)?.slice();
  }

  async writeOnce(storageReference: string, bytes: Uint8Array): Promise<void> {
    this.writeCount += 1;

    if (this.#files.has(storageReference)) {
      throw new Error('Storage reference already exists.');
    }

    this.#files.set(storageReference, bytes.slice());
  }
}

class MemoryDocumentRepository implements ReceiptDocumentRepository {
  createError: Error | null = null;
  readonly created: ReceiptDocument[];

  constructor(initial: readonly ReceiptDocument[] = []) {
    this.created = [...initial];
  }

  async create(document: ReceiptDocument): Promise<ReceiptDocument> {
    if (this.createError !== null) {
      throw this.createError;
    }

    this.created.push(document);
    return document;
  }

  async findOriginalByHash(candidateSha256: string): Promise<ReceiptDocument | null> {
    return (
      this.created.find((document) => document.isOriginal && document.sha256 === candidateSha256) ??
      null
    );
  }

  async getById(id: string): Promise<ReceiptDocument | null> {
    return this.created.find((document) => document.id === id) ?? null;
  }

  async listByReceiptId(candidateReceiptId: string): Promise<readonly ReceiptDocument[]> {
    return this.created.filter((document) => document.receiptId === candidateReceiptId);
  }
}

function makeDocument(overrides: Partial<ReceiptDocument> = {}): ReceiptDocument {
  return {
    byteSize: 4,
    createdAt: '2026-07-15T01:00:00.000Z',
    heightPixels: 2_400,
    id: documentId,
    isOriginal: true,
    mimeType: 'image/jpeg',
    originalFilename: 'synthetic-receipt.jpg',
    pageCount: 1,
    parentDocumentId: null,
    receiptId,
    sha256,
    sourceType: 'image_import',
    storageReference: `receipt-documents/${receiptId}/originals/${documentId}.jpg`,
    widthPixels: 1_800,
    ...overrides,
  };
}

function makeIngestor(
  overrides: {
    readonly documents?: MemoryDocumentRepository;
    readonly inspection?: AttachmentInspection;
    readonly limits?: AttachmentLimits;
    readonly storage?: MemoryAttachmentStorage;
  } = {},
): AttachmentIngestor {
  return new AttachmentIngestor({
    documents: overrides.documents ?? new MemoryDocumentRepository(),
    hasher: new StaticHasher(),
    inspector: new StaticInspector(overrides.inspection ?? defaultInspection),
    limits: overrides.limits ?? strictLimits,
    storage: overrides.storage ?? new MemoryAttachmentStorage(),
  });
}

function makeInput(
  bytes = Uint8Array.from([1, 2, 3, 4]),
  sourceType: 'camera' | 'image_import' | 'pdf_import' = 'image_import',
) {
  return {
    bytes,
    createdAt: '2026-07-15T01:00:00.000Z',
    documentId,
    originalFilename: 'synthetic-receipt.jpg',
    receiptId,
    sourceType,
  };
}
