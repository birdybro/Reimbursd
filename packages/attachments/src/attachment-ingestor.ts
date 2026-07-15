// SPDX-License-Identifier: GPL-3.0-only
import {
  ReceiptDocumentValidationError,
  validateReceiptDocument,
  type ReceiptDocument,
  type ReceiptDocumentMimeType,
  type ReceiptDocumentSourceType,
} from '@reimbursd/domain';
import type { ReceiptDocumentRepository } from '@reimbursd/database';

import type { AttachmentInspector } from './content-inspector.js';

export interface AttachmentStorage {
  delete(storageReference: string): Promise<void>;
  writeOnce(storageReference: string, bytes: Uint8Array): Promise<void>;
}

export interface AttachmentHasher {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface AttachmentLimits {
  readonly maximumByteSize: number;
  readonly maximumImageDimension: number;
  readonly maximumImagePixels: number;
  readonly maximumPageCount: number;
}

export const defaultAttachmentLimits: AttachmentLimits = {
  maximumByteSize: 25 * 1024 * 1024,
  maximumImageDimension: 20_000,
  maximumImagePixels: 100_000_000,
  maximumPageCount: 100,
};

export interface IngestOriginalAttachmentInput {
  readonly bytes: Uint8Array;
  readonly createdAt: string;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly receiptId: string;
  readonly sourceType: Exclude<ReceiptDocumentSourceType, 'derivative'>;
}

export class AttachmentLimitError extends Error {
  readonly limit: keyof AttachmentLimits;

  constructor(limit: keyof AttachmentLimits, message: string) {
    super(message);
    this.name = 'AttachmentLimitError';
    this.limit = limit;
  }
}

export class AttachmentDuplicateError extends Error {
  readonly existingDocument: ReceiptDocument;

  constructor(existingDocument: ReceiptDocument) {
    super('This file is already attached to the receipt.');
    this.name = 'AttachmentDuplicateError';
    this.existingDocument = existingDocument;
  }
}

export class AttachmentIngestor {
  readonly #documents: ReceiptDocumentRepository;
  readonly #hasher: AttachmentHasher;
  readonly #inspector: AttachmentInspector;
  readonly #limits: AttachmentLimits;
  readonly #storage: AttachmentStorage;

  constructor(dependencies: {
    readonly documents: ReceiptDocumentRepository;
    readonly hasher: AttachmentHasher;
    readonly inspector: AttachmentInspector;
    readonly limits?: AttachmentLimits;
    readonly storage: AttachmentStorage;
  }) {
    this.#documents = dependencies.documents;
    this.#hasher = dependencies.hasher;
    this.#inspector = dependencies.inspector;
    this.#limits = dependencies.limits ?? defaultAttachmentLimits;
    this.#storage = dependencies.storage;
    assertValidLimits(this.#limits);
  }

  async ingestOriginal(input: IngestOriginalAttachmentInput): Promise<ReceiptDocument> {
    const bytes = input.bytes.slice();

    if (bytes.byteLength === 0 || bytes.byteLength > this.#limits.maximumByteSize) {
      throw new AttachmentLimitError(
        'maximumByteSize',
        `Choose a receipt file between 1 byte and ${this.#limits.maximumByteSize} bytes.`,
      );
    }

    const inspection = await this.#inspector.inspect(bytes);
    assertSourceMatchesContent(input.sourceType, inspection.mimeType);
    enforceInspectionLimits(inspection, this.#limits);
    const sha256 = await this.#hasher.sha256(bytes);
    const duplicate = await this.#documents.findOriginalByHash(sha256);

    if (duplicate !== null) {
      throw new AttachmentDuplicateError(duplicate);
    }

    const storageReference = createOriginalStorageReference(
      input.receiptId,
      input.documentId,
      inspection.mimeType,
    );
    const document: ReceiptDocument = {
      byteSize: bytes.byteLength,
      createdAt: input.createdAt,
      heightPixels: inspection.heightPixels,
      id: input.documentId,
      isOriginal: true,
      mimeType: inspection.mimeType,
      originalFilename: input.originalFilename,
      pageCount: inspection.pageCount,
      parentDocumentId: null,
      receiptId: input.receiptId,
      sha256,
      sourceType: input.sourceType,
      storageDeletedAt: null,
      storageReference,
      widthPixels: inspection.widthPixels,
    };
    const issues = validateReceiptDocument(document);

    if (issues.length > 0) {
      throw new ReceiptDocumentValidationError(issues);
    }

    await this.#storage.writeOnce(storageReference, bytes);

    try {
      return await this.#documents.create(document);
    } catch (error) {
      try {
        await this.#storage.delete(storageReference);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Attachment metadata could not be saved and file cleanup also failed.',
        );
      }

      throw error;
    }
  }
}

function assertSourceMatchesContent(
  sourceType: Exclude<ReceiptDocumentSourceType, 'derivative'>,
  mimeType: ReceiptDocumentMimeType,
): void {
  if ((sourceType === 'pdf_import') !== (mimeType === 'application/pdf')) {
    throw new TypeError('Attachment source does not match the validated file contents.');
  }
}

function assertValidLimits(limits: AttachmentLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
}

function createOriginalStorageReference(
  receiptId: string,
  documentId: string,
  mimeType: ReceiptDocumentMimeType,
): string {
  const extensionByMimeType: Record<ReceiptDocumentMimeType, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };

  return `receipt-documents/${receiptId}/originals/${documentId}.${extensionByMimeType[mimeType]}`;
}

function enforceInspectionLimits(
  inspection: Awaited<ReturnType<AttachmentInspector['inspect']>>,
  limits: AttachmentLimits,
): void {
  if (inspection.pageCount > limits.maximumPageCount) {
    throw new AttachmentLimitError(
      'maximumPageCount',
      `Choose a PDF with no more than ${limits.maximumPageCount} pages.`,
    );
  }

  if (inspection.widthPixels === null || inspection.heightPixels === null) {
    return;
  }

  if (
    inspection.widthPixels > limits.maximumImageDimension ||
    inspection.heightPixels > limits.maximumImageDimension
  ) {
    throw new AttachmentLimitError(
      'maximumImageDimension',
      `Choose an image no wider or taller than ${limits.maximumImageDimension} pixels.`,
    );
  }

  if (inspection.widthPixels * inspection.heightPixels > limits.maximumImagePixels) {
    throw new AttachmentLimitError(
      'maximumImagePixels',
      `Choose an image containing no more than ${limits.maximumImagePixels} pixels.`,
    );
  }
}
