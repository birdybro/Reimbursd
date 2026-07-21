// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';
import {
  AttachmentInspectionError,
  AttachmentLimitError,
  defaultAttachmentLimits,
  type AttachmentInspector,
  type AttachmentLimits,
} from '@reimbursd/attachments';
import {
  isUuid,
  ReceiptDocumentValidationError,
  validateReceiptDocument,
  type ReceiptDocument,
  type ReceiptDocumentMimeType,
  type ReceiptDocumentSourceType,
} from '@reimbursd/domain';
import {
  HostedReceiptDocumentDuplicateError,
  type HostedReceiptDocumentRepository,
} from './hosted-receipt-document-repository.js';
import { HostedObjectAlreadyExistsError, type HostedObjectStorage } from './object-storage.js';

export interface UploadHostedAttachmentInput {
  readonly bytes: Uint8Array;
  readonly documentId: string;
  readonly originalFilename: string;
  readonly ownerId: string;
  readonly receiptId: string;
  readonly sourceType: Exclude<ReceiptDocumentSourceType, 'derivative'>;
}

export interface DownloadedHostedAttachment {
  readonly bytes: Uint8Array;
  readonly document: ReceiptDocument;
}

export interface HostedAttachmentOperations {
  download(
    ownerId: string,
    receiptId: string,
    documentId: string,
  ): Promise<DownloadedHostedAttachment | null>;
  upload(input: UploadHostedAttachmentInput): Promise<ReceiptDocument>;
}

export class HostedAttachmentIntegrityError extends Error {
  constructor() {
    super('Hosted attachment bytes do not match their metadata.');
    this.name = 'HostedAttachmentIntegrityError';
  }
}

export class HostedAttachmentService implements HostedAttachmentOperations {
  readonly #clock: () => Date;
  readonly #documents: HostedReceiptDocumentRepository;
  readonly #inspector: AttachmentInspector;
  readonly #limits: AttachmentLimits;
  readonly #storage: HostedObjectStorage;

  constructor(dependencies: {
    readonly clock?: () => Date;
    readonly documents: HostedReceiptDocumentRepository;
    readonly inspector: AttachmentInspector;
    readonly limits?: AttachmentLimits;
    readonly storage: HostedObjectStorage;
  }) {
    this.#clock = dependencies.clock ?? (() => new Date());
    this.#documents = dependencies.documents;
    this.#inspector = dependencies.inspector;
    this.#limits = dependencies.limits ?? defaultAttachmentLimits;
    this.#storage = dependencies.storage;
    assertValidLimits(this.#limits);
  }

  async upload(input: UploadHostedAttachmentInput): Promise<ReceiptDocument> {
    assertUploadIdentity(input);
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
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const duplicate = await this.#documents.findOriginalByHashForOwner(input.ownerId, sha256);

    if (duplicate) {
      throw new HostedReceiptDocumentDuplicateError();
    }

    const storageReference = createStorageReference(
      input.ownerId,
      input.receiptId,
      input.documentId,
      inspection.mimeType,
    );
    const document: ReceiptDocument = {
      byteSize: bytes.byteLength,
      createdAt: this.#clock().toISOString(),
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
    assertValidDocument(document);

    try {
      await this.#storage.writeOnce(storageReference, bytes, inspection.mimeType, sha256);
    } catch (error) {
      if (error instanceof HostedObjectAlreadyExistsError) {
        throw new HostedReceiptDocumentDuplicateError();
      }

      throw error;
    }

    try {
      return await this.#documents.createForOwner(input.ownerId, document);
    } catch (error) {
      try {
        await this.#storage.delete(storageReference);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Hosted attachment metadata failed and object cleanup also failed.',
        );
      }

      throw error;
    }
  }

  async download(
    ownerId: string,
    receiptId: string,
    documentId: string,
  ): Promise<DownloadedHostedAttachment | null> {
    const document = await this.#documents.getByIdForOwner(ownerId, receiptId, documentId);

    if (!document) {
      return null;
    }

    const bytes = await this.#storage.read(document.storageReference, this.#limits.maximumByteSize);
    const sha256 = createHash('sha256').update(bytes).digest('hex');

    if (bytes.byteLength !== document.byteSize || sha256 !== document.sha256) {
      throw new HostedAttachmentIntegrityError();
    }

    return { bytes, document };
  }
}

function assertUploadIdentity(input: UploadHostedAttachmentInput): void {
  if (!isUuid(input.ownerId)) {
    throw new TypeError('Owner ID must be a UUID.');
  }

  const issues = [
    ...(isUuid(input.receiptId)
      ? []
      : [{ field: 'receiptId' as const, message: 'Receipt ID must be a UUID.' }]),
    ...(isUuid(input.documentId)
      ? []
      : [{ field: 'id' as const, message: 'Document ID must be a UUID.' }]),
  ];

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }
}

function createStorageReference(
  ownerId: string,
  receiptId: string,
  documentId: string,
  mimeType: ReceiptDocumentMimeType,
): string {
  const extensions: Record<ReceiptDocumentMimeType, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
  };
  return `owners/${ownerId}/receipts/${receiptId}/originals/${documentId}.${extensions[mimeType]}`;
}

function assertSourceMatchesContent(
  sourceType: Exclude<ReceiptDocumentSourceType, 'derivative'>,
  mimeType: ReceiptDocumentMimeType,
): void {
  if ((sourceType === 'pdf_import') !== (mimeType === 'application/pdf')) {
    throw new AttachmentInspectionError('Attachment source does not match validated content.');
  }
}

function enforceInspectionLimits(
  inspection: Awaited<ReturnType<AttachmentInspector['inspect']>>,
  limits: AttachmentLimits,
): void {
  if (inspection.pageCount > limits.maximumPageCount) {
    throw new AttachmentLimitError('maximumPageCount', 'The receipt has too many pages.');
  }

  if (inspection.widthPixels === null || inspection.heightPixels === null) {
    return;
  }

  if (
    inspection.widthPixels > limits.maximumImageDimension ||
    inspection.heightPixels > limits.maximumImageDimension
  ) {
    throw new AttachmentLimitError('maximumImageDimension', 'The receipt image is too large.');
  }

  if (inspection.widthPixels * inspection.heightPixels > limits.maximumImagePixels) {
    throw new AttachmentLimitError('maximumImagePixels', 'The receipt image has too many pixels.');
  }
}

function assertValidDocument(document: ReceiptDocument): void {
  const issues = validateReceiptDocument(document);

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }
}

function assertValidLimits(limits: AttachmentLimits): void {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError('Hosted attachment limits must be positive safe integers.');
    }
  }
}
