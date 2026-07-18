// SPDX-License-Identifier: GPL-3.0-only
import { strToU8, zipSync, type Zippable } from 'fflate';

import {
  assertValidCategory,
  assertValidFieldEvidence,
  assertValidProcessingHistory,
  assertValidTag,
  isUuid,
  validateReceipt,
  validateReceiptDocument,
  type Category,
  type FieldEvidence,
  type ProcessingHistory,
  type Receipt,
  type ReceiptDocument,
  type Tag,
} from '@reimbursd/domain';

const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const structuredExportFormatVersion = 1;

export interface ExportMerchant {
  readonly createdAt: string;
  readonly displayName: string;
  readonly id: string;
  readonly normalizedName: string;
  readonly phone: string | null;
  readonly updatedAt: string;
  readonly website: string | null;
}

export interface ExportReceiptTag {
  readonly assignedAt: string;
  readonly deletedAt: string | null;
  readonly receiptId: string;
  readonly tagId: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface StructuredExportRecords {
  readonly categories: readonly Category[];
  readonly fieldEvidence: readonly FieldEvidence[];
  readonly merchants: readonly ExportMerchant[];
  readonly processingHistory: readonly ProcessingHistory[];
  readonly receiptDocuments: readonly ReceiptDocument[];
  readonly receiptTags: readonly ExportReceiptTag[];
  readonly receipts: readonly Receipt[];
  readonly tags: readonly Tag[];
}

export interface StructuredExportAttachment {
  readonly bytes: Uint8Array;
  readonly documentId: string;
}

export interface StructuredExportHasher {
  sha256(bytes: Uint8Array): Promise<string>;
}

export interface StructuredExportRecordFile {
  readonly byteSize: number;
  readonly kind: 'records';
  readonly path: string;
  readonly recordCount: number;
  readonly sha256: string;
}

export interface StructuredExportAttachmentFile {
  readonly byteSize: number;
  readonly documentId: string;
  readonly kind: 'attachment';
  readonly mimeType: string;
  readonly originalFilename: string;
  readonly path: string;
  readonly sha256: string;
}

export type StructuredExportFile = StructuredExportAttachmentFile | StructuredExportRecordFile;

export interface StructuredExportManifest {
  readonly applicationVersion: string;
  readonly createdAt: string;
  readonly files: readonly StructuredExportFile[];
  readonly format: 'reimbursd-export';
  readonly formatVersion: typeof structuredExportFormatVersion;
  readonly includesOriginalAttachments: boolean;
  readonly schemaVersion: number;
}

export interface StructuredExportArchive {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly manifest: StructuredExportManifest;
}

export class StructuredExportValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StructuredExportValidationError';
  }
}

export function assertValidStructuredExportRecords(records: StructuredExportRecords): void {
  validateRecords(records);
}

export async function createStructuredExport({
  applicationVersion,
  attachments,
  createdAt,
  hasher,
  includeOriginalAttachments,
  records,
  schemaVersion,
}: {
  readonly applicationVersion: string;
  readonly attachments: readonly StructuredExportAttachment[];
  readonly createdAt: string;
  readonly hasher: StructuredExportHasher;
  readonly includeOriginalAttachments: boolean;
  readonly records: StructuredExportRecords;
  readonly schemaVersion: number;
}): Promise<StructuredExportArchive> {
  assertExportMetadata(applicationVersion, createdAt, schemaVersion);
  validateRecords(records);

  const attachmentDocuments = await validateAttachments({
    attachments,
    hasher,
    includeOriginalAttachments,
    records,
  });
  const attachmentPaths = new Map(
    attachmentDocuments.map(({ document, path }) => [document.id, path] as const),
  );
  const recordFiles = createRecordFiles(records, attachmentPaths);
  const archiveContents = new Map<string, Uint8Array>();
  const manifestFiles: StructuredExportFile[] = [];

  for (const file of recordFiles) {
    const bytes = strToU8(stableJson(file.records));
    const sha256 = await hashBytes(hasher, bytes);
    archiveContents.set(file.path, bytes);
    manifestFiles.push({
      byteSize: bytes.byteLength,
      kind: 'records',
      path: file.path,
      recordCount: file.records.length,
      sha256,
    });
  }

  for (const { attachment, document, path, sha256 } of attachmentDocuments) {
    const bytes = Uint8Array.from(attachment.bytes);
    archiveContents.set(path, bytes);
    manifestFiles.push({
      byteSize: bytes.byteLength,
      documentId: document.id,
      kind: 'attachment',
      mimeType: document.mimeType,
      originalFilename: document.originalFilename,
      path,
      sha256,
    });
  }

  manifestFiles.sort((left, right) => left.path.localeCompare(right.path));
  const manifest: StructuredExportManifest = {
    applicationVersion,
    createdAt,
    files: manifestFiles,
    format: 'reimbursd-export',
    formatVersion: structuredExportFormatVersion,
    includesOriginalAttachments: includeOriginalAttachments,
    schemaVersion,
  };
  const checksums = manifestFiles.map(({ path, sha256 }) => `${sha256}  ${path}`).join('\n') + '\n';
  archiveContents.set('checksums.txt', strToU8(checksums));
  archiveContents.set('manifest.json', strToU8(stableJson(manifest)));

  const archiveDate = new Date(createdAt);
  const zipEntries: Zippable = {};

  for (const [path, bytes] of [...archiveContents].sort(([left], [right]) =>
    left.localeCompare(right),
  )) {
    zipEntries[path] = [
      bytes,
      { level: path.startsWith('attachments/') ? 0 : 6, mtime: archiveDate },
    ];
  }

  return {
    bytes: zipSync(zipEntries),
    filename: `reimbursd-export-${createdAt.slice(0, 10)}.zip`,
    manifest,
  };
}

function createRecordFiles(
  records: StructuredExportRecords,
  attachmentPaths: ReadonlyMap<string, string>,
): readonly { readonly path: string; readonly records: readonly unknown[] }[] {
  return [
    { path: 'receipts.json', records: records.receipts },
    { path: 'merchants.json', records: records.merchants },
    { path: 'locations.json', records: [] },
    { path: 'line-items.json', records: [] },
    { path: 'categories.json', records: records.categories },
    { path: 'tags.json', records: records.tags },
    { path: 'receipt-tags.json', records: records.receiptTags },
    {
      path: 'receipt-documents.json',
      records: records.receiptDocuments.map((document) => ({
        ...document,
        attachmentPath: attachmentPaths.get(document.id) ?? null,
      })),
    },
    { path: 'field-evidence.json', records: records.fieldEvidence },
    { path: 'processing-history.json', records: records.processingHistory },
  ];
}

async function validateAttachments({
  attachments,
  hasher,
  includeOriginalAttachments,
  records,
}: {
  readonly attachments: readonly StructuredExportAttachment[];
  readonly hasher: StructuredExportHasher;
  readonly includeOriginalAttachments: boolean;
  readonly records: StructuredExportRecords;
}): Promise<
  readonly {
    readonly attachment: StructuredExportAttachment;
    readonly document: ReceiptDocument;
    readonly path: string;
    readonly sha256: string;
  }[]
> {
  if (!includeOriginalAttachments && attachments.length > 0) {
    throw new StructuredExportValidationError(
      'Attachment bytes cannot be supplied when original attachments are excluded.',
    );
  }

  const suppliedDocumentIds = new Set<string>();

  for (const { documentId } of attachments) {
    if (suppliedDocumentIds.has(documentId)) {
      throw new StructuredExportValidationError('Export attachment document IDs must be unique.');
    }

    suppliedDocumentIds.add(documentId);
  }

  const originals = records.receiptDocuments.filter(({ isOriginal }) => isOriginal);

  if (includeOriginalAttachments && attachments.length !== originals.length) {
    throw new StructuredExportValidationError(
      'Every original receipt document must have attachment bytes in a complete export.',
    );
  }

  const originalsById = new Map(originals.map((document) => [document.id, document] as const));
  const results = [];

  for (const attachment of attachments) {
    const document = originalsById.get(attachment.documentId);

    if (document === undefined) {
      throw new StructuredExportValidationError(
        'Export attachment does not reference an original receipt document.',
      );
    }

    if (attachment.bytes.byteLength !== document.byteSize) {
      throw new StructuredExportValidationError(
        'Export attachment byte size does not match its document metadata.',
      );
    }

    const sha256 = await hashBytes(hasher, Uint8Array.from(attachment.bytes));

    if (sha256 !== document.sha256) {
      throw new StructuredExportValidationError(
        'Export attachment checksum does not match its document metadata.',
      );
    }

    results.push({
      attachment,
      document,
      path: `attachments/${document.id}${extensionForMimeType(document.mimeType)}`,
      sha256,
    });
  }

  return results.sort((left, right) => left.path.localeCompare(right.path));
}

function validateRecords(records: StructuredExportRecords): void {
  const receiptIds = uniqueIds(records.receipts, ({ id }) => id, 'Receipt');
  const merchantIds = uniqueIds(records.merchants, ({ id }) => id, 'Merchant');
  const categoryIds = uniqueIds(records.categories, ({ id }) => id, 'Category');
  const tagIds = uniqueIds(records.tags, ({ id }) => id, 'Tag');
  const documentIds = uniqueIds(records.receiptDocuments, ({ id }) => id, 'Receipt document');
  uniqueValues(records.merchants, ({ normalizedName }) => normalizedName, 'Merchant names');
  uniqueValues(records.categories, ({ normalizedName }) => normalizedName, 'Category names');
  uniqueValues(records.tags, ({ normalizedName }) => normalizedName, 'Tag names');
  uniqueValues(
    records.receiptDocuments,
    ({ storageReference }) => storageReference,
    'Receipt document storage references',
  );
  uniqueValues(
    records.receiptDocuments.filter(({ isOriginal }) => isOriginal),
    ({ receiptId, sha256 }) => `${receiptId}:${sha256}`,
    'Original receipt document hashes',
  );
  uniqueIds(records.fieldEvidence, ({ id }) => id, 'Field evidence');
  uniqueIds(records.processingHistory, ({ id }) => id, 'Processing history');

  for (const receipt of records.receipts) {
    if (validateReceipt(receipt).length > 0 || receipt.deletedAt !== null) {
      throw new StructuredExportValidationError('Structured export contains an invalid receipt.');
    }

    if (!merchantIds.has(receipt.merchantId)) {
      throw new StructuredExportValidationError('Receipt references an unavailable merchant.');
    }

    const merchant = records.merchants.find(({ id }) => id === receipt.merchantId);

    if (merchant?.displayName !== receipt.merchantName) {
      throw new StructuredExportValidationError('Receipt merchant display data is inconsistent.');
    }

    if (receipt.categoryId !== null && !categoryIds.has(receipt.categoryId)) {
      throw new StructuredExportValidationError('Receipt references an unavailable category.');
    }

    if (receipt.locationId !== null) {
      throw new StructuredExportValidationError(
        'Receipt references a location that is unavailable in this export schema.',
      );
    }
  }

  for (const merchant of records.merchants) {
    assertValidMerchant(merchant);
  }

  for (const category of records.categories) {
    assertValidCategory(category);

    if (category.deletedAt !== null) {
      throw new StructuredExportValidationError('Structured export contains a deleted category.');
    }
  }

  for (const tag of records.tags) {
    assertValidTag(tag);

    if (tag.deletedAt !== null) {
      throw new StructuredExportValidationError('Structured export contains a deleted tag.');
    }
  }

  const receiptTagKeys = new Set<string>();

  for (const receiptTag of records.receiptTags) {
    assertValidReceiptTag(receiptTag);
    const key = `${receiptTag.receiptId}:${receiptTag.tagId}`;

    if (receiptTagKeys.has(key)) {
      throw new StructuredExportValidationError('Receipt-tag relationships must be unique.');
    }

    receiptTagKeys.add(key);

    if (!receiptIds.has(receiptTag.receiptId) || !tagIds.has(receiptTag.tagId)) {
      throw new StructuredExportValidationError(
        'Receipt-tag relationship references unavailable records.',
      );
    }
  }

  for (const document of records.receiptDocuments) {
    if (validateReceiptDocument(document).length > 0 || document.storageDeletedAt !== null) {
      throw new StructuredExportValidationError(
        'Structured export contains an invalid receipt document.',
      );
    }

    if (!receiptIds.has(document.receiptId)) {
      throw new StructuredExportValidationError(
        'Receipt document references an unavailable receipt.',
      );
    }

    if (document.parentDocumentId !== null) {
      if (!documentIds.has(document.parentDocumentId)) {
        throw new StructuredExportValidationError(
          'Receipt document references an unavailable parent document.',
        );
      }

      const parent = records.receiptDocuments.find(({ id }) => id === document.parentDocumentId);

      if (parent?.receiptId !== document.receiptId || !parent.isOriginal) {
        throw new StructuredExportValidationError(
          'Receipt document parent must be an original from the same receipt.',
        );
      }
    }
  }

  for (const evidence of records.fieldEvidence) {
    assertValidFieldEvidence(evidence);

    if (!receiptIds.has(evidence.receiptId)) {
      throw new StructuredExportValidationError(
        'Field evidence references an unavailable receipt.',
      );
    }
  }

  for (const history of records.processingHistory) {
    assertValidProcessingHistory(history);

    if (!receiptIds.has(history.receiptId)) {
      throw new StructuredExportValidationError(
        'Processing history references an unavailable receipt.',
      );
    }
  }
}

function assertValidMerchant(merchant: ExportMerchant): void {
  if (
    !isUuid(merchant.id) ||
    merchant.displayName.length === 0 ||
    merchant.displayName.length > 200 ||
    merchant.displayName !== merchant.displayName.trim() ||
    merchant.normalizedName.length === 0 ||
    merchant.normalizedName.length > 200 ||
    merchant.normalizedName !==
      merchant.displayName.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US') ||
    !isOptionalBoundedText(merchant.website) ||
    !isOptionalBoundedText(merchant.phone) ||
    !isOffsetDateTime(merchant.createdAt) ||
    !isOffsetDateTime(merchant.updatedAt) ||
    Date.parse(merchant.updatedAt) < Date.parse(merchant.createdAt)
  ) {
    throw new StructuredExportValidationError('Structured export contains an invalid merchant.');
  }
}

function assertValidReceiptTag(receiptTag: ExportReceiptTag): void {
  if (
    !isUuid(receiptTag.receiptId) ||
    !isUuid(receiptTag.tagId) ||
    !isOffsetDateTime(receiptTag.assignedAt) ||
    !isOffsetDateTime(receiptTag.updatedAt) ||
    receiptTag.deletedAt !== null ||
    !Number.isSafeInteger(receiptTag.version) ||
    receiptTag.version < 1 ||
    Date.parse(receiptTag.updatedAt) < Date.parse(receiptTag.assignedAt)
  ) {
    throw new StructuredExportValidationError(
      'Structured export contains an invalid receipt-tag relationship.',
    );
  }
}

function assertExportMetadata(
  applicationVersion: string,
  createdAt: string,
  schemaVersion: number,
): void {
  if (
    applicationVersion.length === 0 ||
    applicationVersion.length > 100 ||
    !/^[0-9A-Za-z.+-]+$/.test(applicationVersion)
  ) {
    throw new StructuredExportValidationError('Application version is invalid.');
  }

  if (!isOffsetDateTime(createdAt)) {
    throw new StructuredExportValidationError('Export creation time is invalid.');
  }

  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new StructuredExportValidationError('Schema version is invalid.');
  }
}

function uniqueIds<Record>(
  records: readonly Record[],
  getId: (record: Record) => string,
  label: string,
): ReadonlySet<string> {
  const ids = new Set<string>();

  for (const record of records) {
    const id = getId(record);

    if (ids.has(id)) {
      throw new StructuredExportValidationError(`${label} IDs must be unique.`);
    }

    ids.add(id);
  }

  return ids;
}

function uniqueValues<Record>(
  records: readonly Record[],
  getValue: (record: Record) => string,
  label: string,
): void {
  const values = new Set<string>();

  for (const record of records) {
    const value = getValue(record);

    if (values.has(value)) {
      throw new StructuredExportValidationError(`${label} must be unique.`);
    }

    values.add(value);
  }
}

async function hashBytes(hasher: StructuredExportHasher, bytes: Uint8Array): Promise<string> {
  const hash = await hasher.sha256(Uint8Array.from(bytes));

  if (!sha256Pattern.test(hash)) {
    throw new StructuredExportValidationError('Export hasher returned an invalid SHA-256 value.');
  }

  return hash;
}

function extensionForMimeType(mimeType: ReceiptDocument['mimeType']): string {
  switch (mimeType) {
    case 'application/pdf':
      return '.pdf';
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
  }
}

function isOptionalBoundedText(value: string | null): boolean {
  return value === null || (value.length <= 500 && !/[\u0000-\u001f\u007f]/.test(value));
}

function isOffsetDateTime(value: string): boolean {
  return offsetDateTimePattern.test(value) && !Number.isNaN(Date.parse(value));
}

type JsonValue =
  boolean | null | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

function stableJson(value: unknown): string {
  return `${JSON.stringify(toStableJsonValue(value), null, 2)}\n`;
}

function toStableJsonValue(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new StructuredExportValidationError('Export record contains a non-finite number.');
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map(toStableJsonValue);
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, toStableJsonValue(entryValue)]),
    );
  }

  throw new StructuredExportValidationError('Export record contains a non-JSON value.');
}
