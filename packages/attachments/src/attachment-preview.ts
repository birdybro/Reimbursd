// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptDocumentRepository } from '@reimbursd/database';
import {
  ReceiptDocumentValidationError,
  validateReceiptDocument,
  type ReceiptDocument,
  type ReceiptDocumentMimeType,
} from '@reimbursd/domain';

import type { AttachmentHasher, AttachmentStorage } from './attachment-ingestor.js';
import type { AttachmentInspection, AttachmentInspector } from './content-inspector.js';

export interface AttachmentPreviewLimits {
  readonly maximumByteSize: number;
  readonly maximumDimension: number;
  readonly maximumPixels: number;
}

export const defaultAttachmentPreviewLimits: AttachmentPreviewLimits = {
  maximumByteSize: 5 * 1024 * 1024,
  maximumDimension: 1_600,
  maximumPixels: 2_560_000,
};

export interface WriteAttachmentPreviewInput {
  readonly bytes: Uint8Array;
  readonly createdAt: string;
  readonly documentId: string;
  readonly original: ReceiptDocument;
}

export class AttachmentPreviewValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AttachmentPreviewValidationError';
  }
}

export class AttachmentPreviewWriter {
  readonly #documents: ReceiptDocumentRepository;
  readonly #hasher: AttachmentHasher;
  readonly #inspector: AttachmentInspector;
  readonly #limits: AttachmentPreviewLimits;
  readonly #storage: AttachmentStorage;

  constructor(dependencies: {
    readonly documents: ReceiptDocumentRepository;
    readonly hasher: AttachmentHasher;
    readonly inspector: AttachmentInspector;
    readonly limits?: AttachmentPreviewLimits;
    readonly storage: AttachmentStorage;
  }) {
    this.#documents = dependencies.documents;
    this.#hasher = dependencies.hasher;
    this.#inspector = dependencies.inspector;
    this.#limits = dependencies.limits ?? defaultAttachmentPreviewLimits;
    this.#storage = dependencies.storage;
    assertValidLimits(this.#limits);
  }

  async write(input: WriteAttachmentPreviewInput): Promise<ReceiptDocument> {
    assertPreviewableOriginal(input.original);
    const bytes = input.bytes.slice();

    if (bytes.byteLength === 0 || bytes.byteLength > this.#limits.maximumByteSize) {
      throw new AttachmentPreviewValidationError('Generated preview byte size is invalid.');
    }

    const inspection = await this.#inspector.inspect(bytes);
    assertValidPreviewInspection(inspection, this.#limits);
    const sha256 = await this.#hasher.sha256(bytes);
    const storageReference = createPreviewStorageReference(
      input.original.receiptId,
      input.documentId,
      inspection.mimeType,
    );
    const document: ReceiptDocument = {
      byteSize: bytes.byteLength,
      createdAt: input.createdAt,
      heightPixels: inspection.heightPixels,
      id: input.documentId,
      isOriginal: false,
      mimeType: inspection.mimeType,
      originalFilename: `receipt-preview.${extensionForMimeType(inspection.mimeType)}`,
      pageCount: 1,
      parentDocumentId: input.original.id,
      receiptId: input.original.receiptId,
      sha256,
      sourceType: 'derivative',
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
          'Preview metadata could not be saved and file cleanup also failed.',
        );
      }

      throw error;
    }
  }
}

function assertPreviewableOriginal(original: ReceiptDocument): void {
  const issues = validateReceiptDocument(original);

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }

  if (
    !original.isOriginal ||
    original.mimeType === 'application/pdf' ||
    original.storageDeletedAt !== null
  ) {
    throw new AttachmentPreviewValidationError(
      'A preview can only be generated for an active original image.',
    );
  }
}

function assertValidPreviewInspection(
  inspection: AttachmentInspection,
  limits: AttachmentPreviewLimits,
): asserts inspection is AttachmentInspection & {
  readonly heightPixels: number;
  readonly mimeType: Exclude<ReceiptDocumentMimeType, 'application/pdf'>;
  readonly widthPixels: number;
} {
  const { heightPixels, mimeType, pageCount, widthPixels } = inspection;

  if (
    mimeType === 'application/pdf' ||
    pageCount !== 1 ||
    widthPixels === null ||
    heightPixels === null ||
    widthPixels > limits.maximumDimension ||
    heightPixels > limits.maximumDimension ||
    widthPixels * heightPixels > limits.maximumPixels
  ) {
    throw new AttachmentPreviewValidationError(
      'Generated preview content or dimensions are invalid.',
    );
  }
}

function assertValidLimits(limits: AttachmentPreviewLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
}

function createPreviewStorageReference(
  receiptId: string,
  documentId: string,
  mimeType: Exclude<ReceiptDocumentMimeType, 'application/pdf'>,
): string {
  return `receipt-documents/${receiptId}/derivatives/${documentId}.${extensionForMimeType(mimeType)}`;
}

function extensionForMimeType(
  mimeType: Exclude<ReceiptDocumentMimeType, 'application/pdf'>,
): 'jpg' | 'png' {
  return mimeType === 'image/jpeg' ? 'jpg' : 'png';
}
