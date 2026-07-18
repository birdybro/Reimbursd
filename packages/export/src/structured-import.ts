// SPDX-License-Identifier: GPL-3.0-only
import { strFromU8, strToU8, unzipSync, type Unzipped, type UnzipFileInfo } from 'fflate';
import { z } from 'zod';

import {
  evidenceFieldNames,
  fieldEvidenceSourceTypes,
  processingExecutionLocations,
  processingReviewStatuses,
  processingStatuses,
  receiptDocumentMimeTypes,
  receiptDocumentSourceTypes,
  supportedCurrencyCodes,
  type Category,
  type FieldEvidence,
  type ProcessingHistory,
  type Receipt,
  type ReceiptDocument,
  type Tag,
} from '@reimbursd/domain';

import {
  assertValidStructuredExportRecords,
  structuredExportFormatVersion,
  StructuredExportValidationError,
  type ExportMerchant,
  type ExportReceiptTag,
  type StructuredExportAttachment,
  type StructuredExportAttachmentFile,
  type StructuredExportHasher,
  type StructuredExportManifest,
  type StructuredExportRecords,
} from './structured-export.js';

const recordPaths = [
  'categories.json',
  'field-evidence.json',
  'line-items.json',
  'locations.json',
  'merchants.json',
  'processing-history.json',
  'receipt-documents.json',
  'receipt-tags.json',
  'receipts.json',
  'tags.json',
] as const;
const recordPathSet = new Set<string>(recordPaths);
const requiredPaths = ['checksums.txt', 'manifest.json', ...recordPaths] as const;
const attachmentPathPattern =
  /^attachments\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(jpg|pdf|png)$/i;
const sha256Pattern = /^[a-f0-9]{64}$/;
const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;

export interface StructuredExportParseLimits {
  readonly maxArchiveByteSize: number;
  readonly maxAttachmentByteSize: number;
  readonly maxEntryCount: number;
  readonly maxRecordFileByteSize: number;
  readonly maxTotalExpandedByteSize: number;
}

export const defaultStructuredExportParseLimits: StructuredExportParseLimits = {
  maxArchiveByteSize: 1024 * 1024 * 1024,
  maxAttachmentByteSize: 25 * 1024 * 1024,
  maxEntryCount: 10_012,
  maxRecordFileByteSize: 32 * 1024 * 1024,
  maxTotalExpandedByteSize: 1024 * 1024 * 1024,
};

export interface ParsedStructuredExport {
  readonly attachments: readonly StructuredExportAttachment[];
  readonly manifest: StructuredExportManifest;
  readonly records: StructuredExportRecords;
}

const classificationSchema = z
  .object({
    createdAt: z.string(),
    deletedAt: z.string().nullable(),
    id: z.string(),
    name: z.string(),
    normalizedName: z.string(),
    updatedAt: z.string(),
    version: z.number(),
  })
  .strict();
const merchantSchema: z.ZodType<ExportMerchant> = z
  .object({
    createdAt: z.string(),
    displayName: z.string(),
    id: z.string(),
    normalizedName: z.string(),
    phone: z.string().nullable(),
    updatedAt: z.string(),
    website: z.string().nullable(),
  })
  .strict();
const receiptSchema: z.ZodType<Receipt> = z
  .object({
    capturedAt: z.string(),
    categoryId: z.string().nullable(),
    createdAt: z.string(),
    currencyCode: z.enum(supportedCurrencyCodes),
    deletedAt: z.string().nullable(),
    discountMinor: z.number(),
    id: z.string(),
    locationId: z.string().nullable(),
    merchantId: z.string(),
    merchantName: z.string(),
    notes: z.string(),
    purchasedAt: z.string(),
    sourceType: z.literal('manual'),
    subtotalMinor: z.number(),
    taxMinor: z.number(),
    tipMinor: z.number(),
    totalMinor: z.number(),
    updatedAt: z.string(),
    version: z.number(),
  })
  .strict();
const receiptTagSchema: z.ZodType<ExportReceiptTag> = z
  .object({
    assignedAt: z.string(),
    deletedAt: z.string().nullable(),
    receiptId: z.string(),
    tagId: z.string(),
    updatedAt: z.string(),
    version: z.number(),
  })
  .strict();
const documentShape = {
  byteSize: z.number(),
  createdAt: z.string(),
  heightPixels: z.number().nullable(),
  id: z.string(),
  isOriginal: z.boolean(),
  mimeType: z.enum(receiptDocumentMimeTypes),
  originalFilename: z.string(),
  pageCount: z.number(),
  parentDocumentId: z.string().nullable(),
  receiptId: z.string(),
  sha256: z.string(),
  sourceType: z.enum(receiptDocumentSourceTypes),
  storageDeletedAt: z.string().nullable(),
  storageReference: z.string(),
  widthPixels: z.number().nullable(),
} as const;
const exportedDocumentSchema = z
  .object({ ...documentShape, attachmentPath: z.string().nullable() })
  .strict();
const boundingBoxSchema = z
  .object({ height: z.number(), width: z.number(), x: z.number(), y: z.number() })
  .strict();
const evidenceSchema: z.ZodType<FieldEvidence> = z
  .object({
    acceptedAt: z.string().nullable(),
    boundingBox: boundingBoxSchema.nullable(),
    confidence: z.number(),
    correctedAt: z.string().nullable(),
    extractedValue: z.string(),
    fieldName: z.enum(evidenceFieldNames),
    id: z.string(),
    normalizedValue: z.string(),
    pageNumber: z.number().nullable(),
    processedAt: z.string(),
    processorName: z.string(),
    processorVersion: z.string(),
    receiptId: z.string(),
    sourceType: z.enum(fieldEvidenceSourceTypes),
  })
  .strict();
const historySchema: z.ZodType<ProcessingHistory> = z
  .object({
    affectedFields: z.array(z.enum(evidenceFieldNames)),
    completedAt: z.string().nullable(),
    executionLocation: z.enum(processingExecutionLocations),
    failureCode: z.string().nullable(),
    id: z.string(),
    modelVersion: z.string().nullable(),
    processorName: z.string(),
    processorVersion: z.string(),
    providerName: z.string(),
    receiptId: z.string(),
    reviewStatus: z.enum(processingReviewStatuses),
    startedAt: z.string(),
    status: z.enum(processingStatuses),
  })
  .strict();
const recordFileSchema = z
  .object({
    byteSize: z.number(),
    kind: z.literal('records'),
    path: z.string(),
    recordCount: z.number(),
    sha256: z.string(),
  })
  .strict();
const attachmentFileSchema = z
  .object({
    byteSize: z.number(),
    documentId: z.string(),
    kind: z.literal('attachment'),
    mimeType: z.enum(receiptDocumentMimeTypes),
    originalFilename: z.string(),
    path: z.string(),
    sha256: z.string(),
  })
  .strict();
const manifestSchema = z
  .object({
    applicationVersion: z.string(),
    createdAt: z.string(),
    files: z.array(z.discriminatedUnion('kind', [recordFileSchema, attachmentFileSchema])),
    format: z.literal('reimbursd-export'),
    formatVersion: z.literal(structuredExportFormatVersion),
    includesOriginalAttachments: z.boolean(),
    schemaVersion: z.number(),
  })
  .strict();

export async function parseStructuredExport({
  bytes,
  hasher,
  limits = defaultStructuredExportParseLimits,
  supportedSchemaVersion,
}: {
  readonly bytes: Uint8Array;
  readonly hasher: StructuredExportHasher;
  readonly limits?: StructuredExportParseLimits;
  readonly supportedSchemaVersion: number;
}): Promise<ParsedStructuredExport> {
  assertParseLimits(limits);

  if (bytes.byteLength === 0 || bytes.byteLength > limits.maxArchiveByteSize) {
    throw new StructuredExportValidationError('Structured export archive size is invalid.');
  }

  const archive = unzipBounded(bytes, limits);
  assertRequiredArchivePaths(archive);
  const manifest = parseManifest(requiredEntry(archive, 'manifest.json'));

  if (manifest.schemaVersion !== supportedSchemaVersion) {
    throw new StructuredExportValidationError(
      'Structured export database schema version is not supported.',
    );
  }

  assertManifestMetadata(manifest);
  assertManifestFileGraph(manifest, archive);
  await verifyManifestFiles(manifest, archive, hasher);
  assertChecksumsFile(manifest, requiredEntry(archive, 'checksums.txt'));
  const { documents, records } = parseRecords(archive, manifest);
  const attachments = validateParsedAttachments({ archive, documents, manifest });

  try {
    assertValidStructuredExportRecords(records);
  } catch (error) {
    if (error instanceof StructuredExportValidationError) {
      throw error;
    }

    throw new StructuredExportValidationError(
      'Structured export record relationships are invalid.',
    );
  }

  return { attachments, manifest, records };
}

function unzipBounded(bytes: Uint8Array, limits: StructuredExportParseLimits): Unzipped {
  const seenPaths = new Set<string>();
  let entryCount = 0;
  let totalExpandedByteSize = 0;

  try {
    return unzipSync(Uint8Array.from(bytes), {
      filter(file) {
        entryCount += 1;

        if (entryCount > limits.maxEntryCount) {
          throw new StructuredExportValidationError('Structured export has too many files.');
        }

        assertSafeArchiveEntry(file, seenPaths, limits);
        totalExpandedByteSize += file.originalSize;

        if (totalExpandedByteSize > limits.maxTotalExpandedByteSize) {
          throw new StructuredExportValidationError(
            'Structured export expanded size exceeds the configured limit.',
          );
        }

        seenPaths.add(file.name);
        return true;
      },
    });
  } catch (error) {
    if (error instanceof StructuredExportValidationError) {
      throw error;
    }

    throw new StructuredExportValidationError('Structured export ZIP data is invalid.');
  }
}

function assertSafeArchiveEntry(
  file: UnzipFileInfo,
  seenPaths: ReadonlySet<string>,
  limits: StructuredExportParseLimits,
): void {
  if (
    file.name.length === 0 ||
    file.name.length > 200 ||
    file.name.startsWith('/') ||
    file.name.includes('\\') ||
    file.name.includes('\u0000') ||
    file.name.split('/').some((segment) => segment === '.' || segment === '..') ||
    seenPaths.has(file.name) ||
    (!requiredPaths.some((path) => path === file.name) && !attachmentPathPattern.test(file.name)) ||
    !Number.isSafeInteger(file.originalSize) ||
    file.originalSize < 0 ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0 ||
    ![0, 8].includes(file.compression)
  ) {
    throw new StructuredExportValidationError('Structured export contains an unsafe ZIP entry.');
  }

  const maximumSize = file.name.startsWith('attachments/')
    ? limits.maxAttachmentByteSize
    : limits.maxRecordFileByteSize;

  if (file.originalSize > maximumSize) {
    throw new StructuredExportValidationError(
      'Structured export file exceeds its configured size limit.',
    );
  }
}

function assertRequiredArchivePaths(archive: Unzipped): void {
  for (const path of requiredPaths) {
    if (archive[path] === undefined) {
      throw new StructuredExportValidationError('Structured export is missing a required file.');
    }
  }
}

function parseManifest(bytes: Uint8Array): StructuredExportManifest {
  const parsed = parseJson(bytes, 'manifest.json');
  const result = manifestSchema.safeParse(parsed);

  if (!result.success) {
    throw new StructuredExportValidationError('Structured export manifest is invalid.');
  }

  return result.data;
}

function assertManifestMetadata(manifest: StructuredExportManifest): void {
  if (
    manifest.applicationVersion.length === 0 ||
    manifest.applicationVersion.length > 100 ||
    !/^[0-9A-Za-z.+-]+$/.test(manifest.applicationVersion) ||
    !offsetDateTimePattern.test(manifest.createdAt) ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    !Number.isSafeInteger(manifest.schemaVersion) ||
    manifest.schemaVersion < 1
  ) {
    throw new StructuredExportValidationError('Structured export manifest metadata is invalid.');
  }
}

function assertManifestFileGraph(manifest: StructuredExportManifest, archive: Unzipped): void {
  const listedPaths = new Set<string>();

  for (const file of manifest.files) {
    if (
      listedPaths.has(file.path) ||
      file.path === 'manifest.json' ||
      file.path === 'checksums.txt' ||
      archive[file.path] === undefined ||
      !Number.isSafeInteger(file.byteSize) ||
      file.byteSize < 0 ||
      !sha256Pattern.test(file.sha256) ||
      (file.kind === 'records' &&
        (!recordPathSet.has(file.path) ||
          !Number.isSafeInteger(file.recordCount) ||
          file.recordCount < 0)) ||
      (file.kind === 'attachment' && !attachmentPathPattern.test(file.path))
    ) {
      throw new StructuredExportValidationError(
        'Structured export manifest file entries are invalid.',
      );
    }

    listedPaths.add(file.path);
  }

  for (const path of recordPaths) {
    const entry = manifest.files.find((file) => file.path === path);

    if (entry?.kind !== 'records') {
      throw new StructuredExportValidationError(
        'Structured export manifest is missing a record file.',
      );
    }
  }

  const actualListedPaths = Object.keys(archive).filter(
    (path) => path !== 'manifest.json' && path !== 'checksums.txt',
  );

  if (
    actualListedPaths.length !== manifest.files.length ||
    actualListedPaths.some((path) => !listedPaths.has(path))
  ) {
    throw new StructuredExportValidationError(
      'Structured export archive and manifest file lists do not match.',
    );
  }

  const attachmentCount = manifest.files.filter(({ kind }) => kind === 'attachment').length;

  if (!manifest.includesOriginalAttachments && attachmentCount > 0) {
    throw new StructuredExportValidationError(
      'Structured export attachment inclusion metadata is inconsistent.',
    );
  }
}

async function verifyManifestFiles(
  manifest: StructuredExportManifest,
  archive: Unzipped,
  hasher: StructuredExportHasher,
): Promise<void> {
  for (const file of manifest.files) {
    const bytes = requiredEntry(archive, file.path);

    if (bytes.byteLength !== file.byteSize) {
      throw new StructuredExportValidationError(
        'Structured export file size does not match the manifest.',
      );
    }

    const sha256 = await hasher.sha256(Uint8Array.from(bytes));

    if (!sha256Pattern.test(sha256) || sha256 !== file.sha256) {
      throw new StructuredExportValidationError(
        'Structured export file checksum does not match the manifest.',
      );
    }
  }
}

function assertChecksumsFile(manifest: StructuredExportManifest, bytes: Uint8Array): void {
  const expected =
    [...manifest.files]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(({ path, sha256 }) => `${sha256}  ${path}`)
      .join('\n') + '\n';

  if (decodeUtf8(bytes) !== expected) {
    throw new StructuredExportValidationError(
      'Structured export checksums file does not match the manifest.',
    );
  }
}

function parseRecords(
  archive: Unzipped,
  manifest: StructuredExportManifest,
): {
  readonly documents: readonly (ReceiptDocument & { readonly attachmentPath: string | null })[];
  readonly records: StructuredExportRecords;
} {
  const categories = parseRecordArray('categories.json', classificationSchema, archive, manifest);
  const fieldEvidence = parseRecordArray('field-evidence.json', evidenceSchema, archive, manifest);
  const lineItems = parseRecordArray('line-items.json', z.never(), archive, manifest);
  const locations = parseRecordArray('locations.json', z.never(), archive, manifest);
  const merchants = parseRecordArray('merchants.json', merchantSchema, archive, manifest);
  const processingHistory = parseRecordArray(
    'processing-history.json',
    historySchema,
    archive,
    manifest,
  );
  const documents = parseRecordArray(
    'receipt-documents.json',
    exportedDocumentSchema,
    archive,
    manifest,
  );
  const receiptTags = parseRecordArray('receipt-tags.json', receiptTagSchema, archive, manifest);
  const receipts = parseRecordArray('receipts.json', receiptSchema, archive, manifest);
  const tags = parseRecordArray('tags.json', classificationSchema, archive, manifest);

  if (lineItems.length > 0 || locations.length > 0) {
    throw new StructuredExportValidationError(
      'Structured export contains records unsupported by this application version.',
    );
  }

  return {
    documents,
    records: {
      categories: categories as readonly Category[],
      fieldEvidence,
      merchants,
      processingHistory,
      receiptDocuments: documents.map(
        ({ attachmentPath: _attachmentPath, ...document }) => document,
      ),
      receiptTags,
      receipts,
      tags: tags as readonly Tag[],
    },
  };
}

function parseRecordArray<Path extends (typeof recordPaths)[number], Record>(
  path: Path,
  schema: z.ZodType<Record>,
  archive: Unzipped,
  manifest: StructuredExportManifest,
): readonly Record[] {
  const parsed = parseJson(requiredEntry(archive, path), path);
  const result = z.array(schema).safeParse(parsed);
  const manifestFile = manifest.files.find((file) => file.path === path);

  if (
    !result.success ||
    manifestFile?.kind !== 'records' ||
    result.data.length !== manifestFile.recordCount
  ) {
    throw new StructuredExportValidationError(`Structured export record file ${path} is invalid.`);
  }

  return result.data;
}

function validateParsedAttachments({
  archive,
  documents,
  manifest,
}: {
  readonly archive: Unzipped;
  readonly documents: readonly (ReceiptDocument & { readonly attachmentPath: string | null })[];
  readonly manifest: StructuredExportManifest;
}): readonly StructuredExportAttachment[] {
  const attachmentFiles = manifest.files.filter(
    (file): file is StructuredExportAttachmentFile => file.kind === 'attachment',
  );
  const attachments: StructuredExportAttachment[] = [];

  for (const document of documents) {
    const file = attachmentFiles.find(({ documentId }) => documentId === document.id);

    if (document.isOriginal && manifest.includesOriginalAttachments) {
      if (
        file === undefined ||
        document.attachmentPath !== file.path ||
        file.byteSize !== document.byteSize ||
        file.mimeType !== document.mimeType ||
        file.originalFilename !== document.originalFilename ||
        file.sha256 !== document.sha256 ||
        attachmentPathDocumentId(file.path) !== document.id.toLowerCase()
      ) {
        throw new StructuredExportValidationError(
          'Structured export original attachment metadata is inconsistent.',
        );
      }

      attachments.push({
        bytes: Uint8Array.from(requiredEntry(archive, file.path)),
        documentId: document.id,
      });
      continue;
    }

    if (document.attachmentPath !== null || file !== undefined) {
      throw new StructuredExportValidationError(
        'Structured export contains an unexpected document attachment.',
      );
    }
  }

  if (attachments.length !== attachmentFiles.length) {
    throw new StructuredExportValidationError(
      'Structured export contains an attachment without document metadata.',
    );
  }

  return attachments;
}

function attachmentPathDocumentId(path: string): string | null {
  return attachmentPathPattern.exec(path)?.[1]?.toLowerCase() ?? null;
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decodeUtf8(bytes));
  } catch {
    throw new StructuredExportValidationError(`Structured export JSON file ${path} is invalid.`);
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  const decoded = strFromU8(bytes);
  const reencoded = strToU8(decoded);

  if (
    reencoded.byteLength !== bytes.byteLength ||
    reencoded.some((byte, index) => byte !== bytes[index])
  ) {
    throw new StructuredExportValidationError('Structured export text is not valid UTF-8.');
  }

  return decoded;
}

function requiredEntry(archive: Unzipped, path: string): Uint8Array {
  const entry = archive[path];

  if (entry === undefined) {
    throw new StructuredExportValidationError('Structured export is missing a required file.');
  }

  return entry;
}

function assertParseLimits(limits: StructuredExportParseLimits): void {
  if (
    Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1) ||
    limits.maxAttachmentByteSize > limits.maxTotalExpandedByteSize ||
    limits.maxRecordFileByteSize > limits.maxTotalExpandedByteSize
  ) {
    throw new TypeError('Structured export parse limits are invalid.');
  }
}
