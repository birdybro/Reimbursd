// SPDX-License-Identifier: GPL-3.0-only
import {
  isReceiptDocumentMimeType,
  isReceiptDocumentSourceType,
  ReceiptDocumentValidationError,
  validateReceiptDocument,
  type ReceiptDocument,
} from '@reimbursd/domain';

import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface ReceiptDocumentRepository {
  create(document: ReceiptDocument): Promise<ReceiptDocument>;
  findOriginalByHash(sha256: string): Promise<ReceiptDocument | null>;
  getById(id: string): Promise<ReceiptDocument | null>;
  listByReceiptId(receiptId: string): Promise<readonly ReceiptDocument[]>;
  listPendingStorageDeletion(): Promise<readonly ReceiptDocument[]>;
  markStorageDeleted(id: string, storageDeletedAt: string): Promise<ReceiptDocument>;
}

export class ReceiptDocumentDuplicateError extends Error {
  readonly existingDocument: ReceiptDocument;

  constructor(existingDocument: ReceiptDocument) {
    super('This original file was already imported.');
    this.name = 'ReceiptDocumentDuplicateError';
    this.existingDocument = existingDocument;
  }
}

export class ReceiptDocumentReceiptNotFoundError extends Error {
  constructor() {
    super('The receipt for this document was not found.');
    this.name = 'ReceiptDocumentReceiptNotFoundError';
  }
}

export class ReceiptDocumentParentNotFoundError extends Error {
  constructor() {
    super('The original document for this derivative was not found on the receipt.');
    this.name = 'ReceiptDocumentParentNotFoundError';
  }
}

export class ReceiptDocumentNotFoundError extends Error {
  constructor() {
    super('Receipt document was not found.');
    this.name = 'ReceiptDocumentNotFoundError';
  }
}

export class ReceiptDocumentReceiptNotDeletedError extends Error {
  constructor() {
    super('Receipt document storage cannot be deleted while its receipt is active.');
    this.name = 'ReceiptDocumentReceiptNotDeletedError';
  }
}

interface ReceiptDocumentRow {
  byte_size: number;
  created_at: string;
  height_pixels: number | null;
  id: string;
  is_original: number;
  mime_type: string;
  original_filename: string;
  page_count: number;
  parent_document_id: string | null;
  receipt_id: string;
  sha256: string;
  source_type: string;
  storage_deleted_at: string | null;
  storage_reference: string;
  width_pixels: number | null;
}

const selectDocument = `
  SELECT
    id,
    receipt_id,
    parent_document_id,
    storage_reference,
    original_filename,
    mime_type,
    byte_size,
    sha256,
    source_type,
    page_count,
    width_pixels,
    height_pixels,
    is_original,
    created_at,
    storage_deleted_at
  FROM receipt_documents
`;

export class SqliteReceiptDocumentRepository implements ReceiptDocumentRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async create(document: ReceiptDocument): Promise<ReceiptDocument> {
    assertValidDocument(document);

    if (document.storageDeletedAt !== null) {
      throw new TypeError('A new receipt document cannot already have deleted storage.');
    }

    return this.#connection.transaction(async () => {
      const receipt = await this.#connection.getFirst<{ id: string }>(
        'SELECT id FROM receipts WHERE id = ? AND deleted_at IS NULL;',
        [document.receiptId],
      );

      if (receipt === null) {
        throw new ReceiptDocumentReceiptNotFoundError();
      }

      if (document.isOriginal) {
        const duplicate = await this.findOriginalByHash(document.sha256);

        if (duplicate !== null) {
          throw new ReceiptDocumentDuplicateError(duplicate);
        }
      } else {
        const parent = await this.#connection.getFirst<{ id: string }>(
          `
            SELECT id FROM receipt_documents
            WHERE id = ? AND receipt_id = ? AND is_original = 1;
          `,
          [document.parentDocumentId, document.receiptId],
        );

        if (parent === null) {
          throw new ReceiptDocumentParentNotFoundError();
        }
      }

      await this.#connection.run(
        `
          INSERT INTO receipt_documents (
            id, receipt_id, parent_document_id, storage_reference, original_filename,
            mime_type, byte_size, sha256, page_count, width_pixels, height_pixels,
            is_original, created_at, source_type, storage_deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        documentParameters(document),
      );

      return document;
    });
  }

  async findOriginalByHash(sha256: string): Promise<ReceiptDocument | null> {
    const row = await this.#connection.getFirst<ReceiptDocumentRow>(
      `${selectDocument}
       WHERE sha256 = ? AND is_original = 1
       ORDER BY created_at, id
       LIMIT 1;`,
      [sha256],
    );

    return row === null ? null : mapDocumentRow(row);
  }

  async getById(id: string): Promise<ReceiptDocument | null> {
    const row = await this.#connection.getFirst<ReceiptDocumentRow>(
      `${selectDocument} WHERE id = ?;`,
      [id],
    );

    return row === null ? null : mapDocumentRow(row);
  }

  async listByReceiptId(receiptId: string): Promise<readonly ReceiptDocument[]> {
    const rows = await this.#connection.getAll<ReceiptDocumentRow>(
      `${selectDocument}
       WHERE receipt_id = ?
       ORDER BY is_original DESC, created_at, id;`,
      [receiptId],
    );

    return rows.map(mapDocumentRow);
  }

  async listPendingStorageDeletion(): Promise<readonly ReceiptDocument[]> {
    const rows = await this.#connection.getAll<ReceiptDocumentRow>(
      `${selectDocument}
       WHERE receipt_id IN (SELECT id FROM receipts WHERE deleted_at IS NOT NULL)
         AND storage_deleted_at IS NULL
       ORDER BY created_at, id;`,
    );

    return rows.map(mapDocumentRow);
  }

  async markStorageDeleted(id: string, storageDeletedAt: string): Promise<ReceiptDocument> {
    return this.#connection.transaction(async () => {
      const existing = await this.getById(id);

      if (existing === null) {
        throw new ReceiptDocumentNotFoundError();
      }

      if (existing.storageDeletedAt !== null) {
        return existing;
      }

      const tombstone = await this.#connection.getFirst<{ deleted_at: string | null }>(
        'SELECT deleted_at FROM receipts WHERE id = ?;',
        [existing.receiptId],
      );

      if (tombstone?.deleted_at === null || tombstone === null) {
        throw new ReceiptDocumentReceiptNotDeletedError();
      }

      const candidate: ReceiptDocument = { ...existing, storageDeletedAt };
      assertValidDocument(candidate);
      await this.#connection.run(
        `
          UPDATE receipt_documents
          SET storage_deleted_at = ?
          WHERE id = ? AND storage_deleted_at IS NULL;
        `,
        [storageDeletedAt, id],
      );
      return candidate;
    });
  }
}

function assertValidDocument(document: ReceiptDocument): void {
  const issues = validateReceiptDocument(document);

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }
}

function mapDocumentRow(row: ReceiptDocumentRow): ReceiptDocument {
  if (
    !isReceiptDocumentMimeType(row.mime_type) ||
    !isReceiptDocumentSourceType(row.source_type) ||
    ![0, 1].includes(row.is_original)
  ) {
    throw new Error('Stored receipt document contains unsupported enum data.');
  }

  const document: ReceiptDocument = {
    byteSize: row.byte_size,
    createdAt: row.created_at,
    heightPixels: row.height_pixels,
    id: row.id,
    isOriginal: row.is_original === 1,
    mimeType: row.mime_type,
    originalFilename: row.original_filename,
    pageCount: row.page_count,
    parentDocumentId: row.parent_document_id,
    receiptId: row.receipt_id,
    sha256: row.sha256,
    sourceType: row.source_type,
    storageDeletedAt: row.storage_deleted_at,
    storageReference: row.storage_reference,
    widthPixels: row.width_pixels,
  };
  assertValidDocument(document);
  return document;
}

function documentParameters(document: ReceiptDocument): readonly SqliteValue[] {
  return [
    document.id,
    document.receiptId,
    document.parentDocumentId,
    document.storageReference,
    document.originalFilename,
    document.mimeType,
    document.byteSize,
    document.sha256,
    document.pageCount,
    document.widthPixels,
    document.heightPixels,
    document.isOriginal ? 1 : 0,
    document.createdAt,
    document.sourceType,
    document.storageDeletedAt,
  ];
}
