// SPDX-License-Identifier: GPL-3.0-only
import { strFromU8, strToU8, unzipSync, Zip, zipSync, ZipPassThrough } from 'fflate';
import { describe, expect, it } from 'vitest';

import {
  createCategory,
  createManualReceipt,
  createTag,
  type FieldEvidence,
  type ProcessingHistory,
  type ReceiptDocument,
} from '@reimbursd/domain';

import { defaultStructuredExportParseLimits, parseStructuredExport } from './structured-import.js';
import {
  createStructuredExport,
  StructuredExportValidationError,
  type StructuredExportHasher,
  type StructuredExportRecords,
} from './structured-export.js';

const createdAt = '2026-07-18T07:00:00-06:00';
const receiptId = '22222222-2222-4222-8222-222222222222';
const merchantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const categoryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const tagId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const documentId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const attachmentBytes = Uint8Array.from([137, 80, 78, 71]);

const hasher: StructuredExportHasher = {
  async sha256(bytes) {
    let accumulator = 0;

    for (const byte of bytes) {
      accumulator = (accumulator + byte) % 256;
    }

    return accumulator.toString(16).padStart(64, '0');
  },
};

const emptyRecords: StructuredExportRecords = {
  categories: [],
  fieldEvidence: [],
  merchants: [],
  processingHistory: [],
  receiptDocuments: [],
  receiptTags: [],
  receipts: [],
  tags: [],
};

describe('structured export archive', () => {
  it('creates a deterministic versioned archive with every required record file', async () => {
    const first = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });
    const second = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });
    const files = unzipSync(first.bytes);

    expect(first.filename).toBe('reimbursd-export-2026-07-18.zip');
    expect(first.bytes).toEqual(second.bytes);
    expect(Object.keys(files).sort()).toEqual([
      'categories.json',
      'checksums.txt',
      'field-evidence.json',
      'line-items.json',
      'locations.json',
      'manifest.json',
      'merchants.json',
      'processing-history.json',
      'receipt-documents.json',
      'receipt-tags.json',
      'receipts.json',
      'tags.json',
    ]);
    expect(readJson(files, 'locations.json')).toEqual([]);
    expect(readJson(files, 'line-items.json')).toEqual([]);
    expect(readJson(files, 'manifest.json')).toEqual(first.manifest);
    expect(first.manifest).toMatchObject({
      applicationVersion: '0.1.0',
      createdAt,
      format: 'reimbursd-export',
      formatVersion: 1,
      includesOriginalAttachments: false,
      schemaVersion: 6,
    });
    expect(first.manifest.files).toHaveLength(10);
    expect(first.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'records',
          path: 'receipts.json',
          recordCount: 0,
        }),
      ]),
    );
  });

  it('preserves original attachment bytes and records their verified checksum', async () => {
    const records = populatedRecords();
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [{ bytes: attachmentBytes, documentId }],
      createdAt,
      hasher,
      includeOriginalAttachments: true,
      records,
      schemaVersion: 6,
    });
    const files = unzipSync(archive.bytes);
    const attachmentPath = `attachments/${documentId}.png`;
    const receiptDocuments = readJson(files, 'receipt-documents.json') as readonly Record<
      string,
      unknown
    >[];

    expect(files[attachmentPath]).toEqual(attachmentBytes);
    expect(receiptDocuments).toEqual([
      expect.objectContaining({ attachmentPath, id: documentId, originalFilename: 'receipt.png' }),
    ]);
    expect(strFromU8(requiredFile(files, 'checksums.txt'))).toContain(
      `${hashFor(attachmentBytes)}  ${attachmentPath}\n`,
    );
    expect(archive.manifest.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          byteSize: attachmentBytes.byteLength,
          documentId,
          kind: 'attachment',
          path: attachmentPath,
          sha256: hashFor(attachmentBytes),
        }),
      ]),
    );
  });

  it('rejects incomplete, duplicate, and corrupted attachment input', async () => {
    const records = populatedRecords();
    const baseInput = {
      applicationVersion: '0.1.0',
      createdAt,
      hasher,
      includeOriginalAttachments: true,
      records,
      schemaVersion: 6,
    } as const;

    await expect(createStructuredExport({ ...baseInput, attachments: [] })).rejects.toThrow(
      'Every original receipt document must have attachment bytes',
    );
    await expect(
      createStructuredExport({
        ...baseInput,
        attachments: [
          { bytes: attachmentBytes, documentId },
          { bytes: attachmentBytes, documentId },
        ],
      }),
    ).rejects.toThrow('Export attachment document IDs must be unique.');
    await expect(
      createStructuredExport({
        ...baseInput,
        attachments: [{ bytes: Uint8Array.from([1, 2, 3, 4]), documentId }],
      }),
    ).rejects.toThrow('Export attachment checksum does not match');
  });

  it('rejects snapshots whose active records do not form a complete relationship graph', async () => {
    const records = populatedRecords();

    await expect(
      createStructuredExport({
        applicationVersion: '0.1.0',
        attachments: [],
        createdAt,
        hasher,
        includeOriginalAttachments: false,
        records: { ...records, categories: [] },
        schemaVersion: 6,
      }),
    ).rejects.toBeInstanceOf(StructuredExportValidationError);
  });
});

describe('structured export archive parsing', () => {
  it('validates and owns a complete archive with byte-identical originals', async () => {
    const records = populatedRecords();
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [{ bytes: attachmentBytes, documentId }],
      createdAt,
      hasher,
      includeOriginalAttachments: true,
      records,
      schemaVersion: 6,
    });

    const parsed = await parseStructuredExport({
      bytes: archive.bytes,
      hasher,
      supportedSchemaVersion: 6,
    });

    expect(parsed.manifest).toEqual(archive.manifest);
    expect(parsed.records).toEqual(records);
    expect(parsed.attachments).toEqual([{ bytes: attachmentBytes, documentId }]);
  });

  it('accepts an empty archive whose originals option was enabled', async () => {
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: true,
      records: emptyRecords,
      schemaVersion: 6,
    });

    await expect(
      parseStructuredExport({ bytes: archive.bytes, hasher, supportedSchemaVersion: 6 }),
    ).resolves.toMatchObject({ attachments: [], records: emptyRecords });
    await expect(
      parseStructuredExport({
        bytes: archive.bytes,
        compatibleSchemaVersions: [6],
        hasher,
        supportedSchemaVersion: 7,
      }),
    ).resolves.toMatchObject({ attachments: [], records: emptyRecords });
  });

  it('rejects traversal paths, malformed manifests, and unsupported schema versions', async () => {
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });
    const traversal = rewriteArchive(archive.bytes, (files) => {
      files['../escape.txt'] = strToU8('unsafe');
    });
    const malformedManifest = rewriteArchive(archive.bytes, (files) => {
      files['manifest.json'] = strToU8('{');
    });
    const futureSchema = rewriteManifest(archive.bytes, (manifest) => {
      manifest.schemaVersion = 7;
    });

    await expect(parseArchive(traversal)).rejects.toThrow('unsafe ZIP entry');
    await expect(parseArchive(malformedManifest)).rejects.toThrow('manifest.json is invalid');
    await expect(parseArchive(futureSchema)).rejects.toThrow(
      'database schema version is not supported',
    );
  });

  it('rejects duplicate manifest paths and record checksum changes', async () => {
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });
    const duplicatePath = rewriteManifest(archive.bytes, (manifest) => {
      const first = manifest.files[0];

      if (first !== undefined) {
        manifest.files.push(first);
      }
    });
    const corruptedRecord = rewriteArchive(archive.bytes, (files) => {
      files['receipts.json'] = strToU8('[ ]');
    });

    await expect(parseArchive(duplicatePath)).rejects.toThrow('file entries are invalid');
    await expect(parseArchive(corruptedRecord)).rejects.toThrow(
      'checksum does not match the manifest',
    );
  });

  it('rejects duplicate physical ZIP entries', async () => {
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });
    const duplicate = await duplicateArchiveEntry(archive.bytes, 'manifest.json');

    await expect(parseArchive(duplicate)).rejects.toThrow('unsafe ZIP entry');
  });

  it('applies configured archive and expanded-entry limits before restore', async () => {
    const archive = await createStructuredExport({
      applicationVersion: '0.1.0',
      attachments: [],
      createdAt,
      hasher,
      includeOriginalAttachments: false,
      records: emptyRecords,
      schemaVersion: 6,
    });

    await expect(
      parseStructuredExport({
        bytes: archive.bytes,
        hasher,
        limits: {
          ...defaultStructuredExportParseLimits,
          maxArchiveByteSize: archive.bytes.byteLength - 1,
        },
        supportedSchemaVersion: 6,
      }),
    ).rejects.toThrow('archive size is invalid');
  });
});

function populatedRecords(): StructuredExportRecords {
  const receipt = {
    ...createManualReceipt({
      capturedAt: createdAt,
      currencyCode: 'USD',
      id: receiptId,
      merchantId,
      merchantName: 'Corner Market',
      purchasedAt: '2026-07-17T12:00:00-06:00',
      subtotalMinor: 1_000,
      taxMinor: 80,
      tipMinor: 0,
      totalMinor: 1_080,
    }),
    categoryId,
  };
  const document: ReceiptDocument = {
    byteSize: attachmentBytes.byteLength,
    createdAt,
    heightPixels: 1,
    id: documentId,
    isOriginal: true,
    mimeType: 'image/png',
    originalFilename: 'receipt.png',
    pageCount: 1,
    parentDocumentId: null,
    receiptId,
    sha256: hashFor(attachmentBytes),
    sourceType: 'image_import',
    storageDeletedAt: null,
    storageReference: `receipts/${receiptId}/originals/${documentId}.png`,
    widthPixels: 1,
  };
  const evidence: FieldEvidence = {
    acceptedAt: null,
    boundingBox: { height: 0.04, width: 0.18, x: 0.7, y: 0.82 },
    confidence: 0.94,
    correctedAt: null,
    extractedValue: '$10.80',
    fieldName: 'total_minor',
    id: '11111111-1111-4111-8111-111111111111',
    normalizedValue: '1080',
    pageNumber: 1,
    processedAt: createdAt,
    processorName: 'deterministic-receipt-parser',
    processorVersion: '1.0.0',
    receiptId,
    sourceType: 'deterministic_parser',
  };
  const history: ProcessingHistory = {
    affectedFields: ['total_minor'],
    completedAt: '2026-07-18T07:00:01-06:00',
    executionLocation: 'local',
    failureCode: null,
    id: '33333333-3333-4333-8333-333333333333',
    modelVersion: null,
    processorName: 'deterministic-receipt-parser',
    processorVersion: '1.0.0',
    providerName: 'reimbursd-local',
    receiptId,
    reviewStatus: 'pending',
    startedAt: createdAt,
    status: 'succeeded',
  };

  return {
    categories: [createCategory({ createdAt, id: categoryId, name: 'Meals' })],
    fieldEvidence: [evidence],
    merchants: [
      {
        createdAt,
        displayName: 'Corner Market',
        id: merchantId,
        normalizedName: 'corner market',
        phone: null,
        updatedAt: createdAt,
        website: null,
      },
    ],
    processingHistory: [history],
    receiptDocuments: [document],
    receiptTags: [
      {
        assignedAt: createdAt,
        deletedAt: null,
        receiptId,
        tagId,
        updatedAt: createdAt,
        version: 1,
      },
    ],
    receipts: [receipt],
    tags: [createTag({ createdAt, id: tagId, name: 'Client visit' })],
  };
}

function readJson(files: Record<string, Uint8Array>, path: string): unknown {
  return JSON.parse(strFromU8(requiredFile(files, path)));
}

function requiredFile(files: Record<string, Uint8Array>, path: string): Uint8Array {
  const file = files[path];

  if (file === undefined) {
    throw new Error(`Archive is missing ${path}.`);
  }

  return file;
}

function hashFor(bytes: Uint8Array): string {
  let accumulator = 0;

  for (const byte of bytes) {
    accumulator = (accumulator + byte) % 256;
  }

  return accumulator.toString(16).padStart(64, '0');
}

function parseArchive(bytes: Uint8Array) {
  return parseStructuredExport({ bytes, hasher, supportedSchemaVersion: 6 });
}

function rewriteArchive(
  bytes: Uint8Array,
  update: (files: Record<string, Uint8Array>) => void,
): Uint8Array {
  const files = unzipSync(bytes);
  update(files);
  return zipSync(files);
}

function rewriteManifest(
  bytes: Uint8Array,
  update: (manifest: { files: unknown[]; schemaVersion: number }) => void,
): Uint8Array {
  return rewriteArchive(bytes, (files) => {
    const manifest = readJson(files, 'manifest.json') as {
      files: unknown[];
      schemaVersion: number;
    };
    update(manifest);
    files['manifest.json'] = strToU8(`${JSON.stringify(manifest)}\n`);
  });
}

function duplicateArchiveEntry(bytes: Uint8Array, path: string): Promise<Uint8Array> {
  const files = unzipSync(bytes);
  const duplicate = requiredFile(files, path);

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const archive = new Zip((error, chunk, final) => {
      if (error !== null) {
        reject(error);
        return;
      }

      chunks.push(Uint8Array.from(chunk));

      if (final) {
        const result = new Uint8Array(chunks.reduce((total, item) => total + item.byteLength, 0));
        let offset = 0;

        for (const item of chunks) {
          result.set(item, offset);
          offset += item.byteLength;
        }

        resolve(result);
      }
    });

    for (const [filename, contents] of Object.entries(files)) {
      const file = new ZipPassThrough(filename);
      archive.add(file);
      file.push(contents, true);
    }

    const duplicateFile = new ZipPassThrough(path);
    archive.add(duplicateFile);
    duplicateFile.push(duplicate, true);
    archive.end();
  });
}
