// SPDX-License-Identifier: GPL-3.0-only
import { isUuid } from './receipt.js';

const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const unsafeMetadataPattern = /[\u0000-\u001f\u007f]/;

export const receiptDocumentMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'] as const;

export type ReceiptDocumentMimeType = (typeof receiptDocumentMimeTypes)[number];

export const receiptDocumentSourceTypes = [
  'camera',
  'image_import',
  'pdf_import',
  'derivative',
] as const;

export type ReceiptDocumentSourceType = (typeof receiptDocumentSourceTypes)[number];

export interface ReceiptDocument {
  readonly byteSize: number;
  readonly createdAt: string;
  readonly heightPixels: number | null;
  readonly id: string;
  readonly isOriginal: boolean;
  readonly mimeType: ReceiptDocumentMimeType;
  readonly originalFilename: string;
  readonly pageCount: number;
  readonly parentDocumentId: string | null;
  readonly receiptId: string;
  readonly sha256: string;
  readonly sourceType: ReceiptDocumentSourceType;
  readonly storageDeletedAt: string | null;
  readonly storageReference: string;
  readonly widthPixels: number | null;
}

export interface ReceiptDocumentValidationIssue {
  readonly field: keyof ReceiptDocument;
  readonly message: string;
}

export class ReceiptDocumentValidationError extends Error {
  readonly issues: readonly ReceiptDocumentValidationIssue[];

  constructor(issues: readonly ReceiptDocumentValidationIssue[]) {
    super('Receipt document data is invalid.');
    this.name = 'ReceiptDocumentValidationError';
    this.issues = issues;
  }
}

export function isReceiptDocumentMimeType(value: string): value is ReceiptDocumentMimeType {
  return receiptDocumentMimeTypes.some((mimeType) => mimeType === value);
}

export function isReceiptDocumentSourceType(value: string): value is ReceiptDocumentSourceType {
  return receiptDocumentSourceTypes.some((sourceType) => sourceType === value);
}

export function validateReceiptDocument(
  document: ReceiptDocument,
): readonly ReceiptDocumentValidationIssue[] {
  const issues: ReceiptDocumentValidationIssue[] = [];

  validateUuid(document.id, 'id', issues);
  validateUuid(document.receiptId, 'receiptId', issues);

  if (document.parentDocumentId !== null) {
    validateUuid(document.parentDocumentId, 'parentDocumentId', issues);
  }

  if (
    document.originalFilename.trim().length === 0 ||
    document.originalFilename.length > 255 ||
    unsafeMetadataPattern.test(document.originalFilename)
  ) {
    issues.push({
      field: 'originalFilename',
      message: 'Original filename must contain 1 to 255 characters without control characters.',
    });
  }

  if (
    document.storageReference.trim().length === 0 ||
    document.storageReference.length > 1_024 ||
    unsafeMetadataPattern.test(document.storageReference)
  ) {
    issues.push({
      field: 'storageReference',
      message: 'Storage reference must contain 1 to 1,024 characters without control characters.',
    });
  }

  if (!isReceiptDocumentMimeType(document.mimeType)) {
    issues.push({ field: 'mimeType', message: 'Document MIME type is not supported.' });
  }

  if (!Number.isSafeInteger(document.byteSize) || document.byteSize <= 0) {
    issues.push({ field: 'byteSize', message: 'Byte size must be a positive safe integer.' });
  }

  if (!sha256Pattern.test(document.sha256)) {
    issues.push({
      field: 'sha256',
      message: 'SHA-256 must be 64 lowercase hexadecimal characters.',
    });
  }

  if (!isReceiptDocumentSourceType(document.sourceType)) {
    issues.push({ field: 'sourceType', message: 'Document source type is not supported.' });
  }

  if (!Number.isSafeInteger(document.pageCount) || document.pageCount <= 0) {
    issues.push({ field: 'pageCount', message: 'Page count must be a positive safe integer.' });
  }

  if (document.mimeType !== 'application/pdf' && document.pageCount !== 1) {
    issues.push({ field: 'pageCount', message: 'Image documents must have exactly one page.' });
  }

  validateDimensions(document, issues);

  if (document.isOriginal && document.parentDocumentId !== null) {
    issues.push({ field: 'parentDocumentId', message: 'Original documents cannot have a parent.' });
  }

  if (!document.isOriginal && document.parentDocumentId === null) {
    issues.push({
      field: 'parentDocumentId',
      message: 'Derived documents must identify a parent.',
    });
  }

  if (document.isOriginal === (document.sourceType === 'derivative')) {
    issues.push({
      field: 'sourceType',
      message: document.isOriginal
        ? 'Original documents must identify their capture or import source.'
        : 'Derived documents must use the derivative source type.',
    });
  }

  if (
    !offsetDateTimePattern.test(document.createdAt) ||
    Number.isNaN(Date.parse(document.createdAt))
  ) {
    issues.push({
      field: 'createdAt',
      message: 'Creation time must be valid ISO 8601 with a timezone offset.',
    });
  }

  if (
    document.storageDeletedAt !== null &&
    (!offsetDateTimePattern.test(document.storageDeletedAt) ||
      Number.isNaN(Date.parse(document.storageDeletedAt)))
  ) {
    issues.push({
      field: 'storageDeletedAt',
      message: 'Storage deletion time must be valid ISO 8601 with a timezone offset.',
    });
  }

  return issues;
}

function validateDimensions(
  document: ReceiptDocument,
  issues: ReceiptDocumentValidationIssue[],
): void {
  if (document.mimeType === 'application/pdf') {
    if (document.widthPixels !== null || document.heightPixels !== null) {
      issues.push({
        field: 'widthPixels',
        message: 'PDF dimensions are recorded per page, not here.',
      });
    }
    return;
  }

  for (const field of ['widthPixels', 'heightPixels'] as const) {
    const value = document[field];

    if (value === null || !Number.isSafeInteger(value) || value <= 0) {
      issues.push({ field, message: 'Image dimensions must be positive safe integers.' });
    }
  }
}

function validateUuid(
  value: string,
  field: 'id' | 'parentDocumentId' | 'receiptId',
  issues: ReceiptDocumentValidationIssue[],
): void {
  if (!isUuid(value)) {
    issues.push({ field, message: 'Identifier must be a UUID.' });
  }
}
