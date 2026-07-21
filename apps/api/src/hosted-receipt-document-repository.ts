// SPDX-License-Identifier: GPL-3.0-only
import {
  isReceiptDocumentMimeType,
  isReceiptDocumentSourceType,
  isUuid,
  ReceiptDocumentValidationError,
  validateReceiptDocument,
  type ReceiptDocument,
  type ReceiptDocumentValidationIssue,
} from '@reimbursd/domain';
import type { Pool } from 'pg';

export interface HostedReceiptDocumentRepository {
  createForOwner(ownerId: string, document: ReceiptDocument): Promise<ReceiptDocument>;
  findOriginalByHashForOwner(ownerId: string, sha256: string): Promise<ReceiptDocument | null>;
  getByIdForOwner(
    ownerId: string,
    receiptId: string,
    documentId: string,
  ): Promise<ReceiptDocument | null>;
}

export class HostedReceiptDocumentDuplicateError extends Error {
  constructor() {
    super('This original file is already stored for the owner.');
    this.name = 'HostedReceiptDocumentDuplicateError';
  }
}

export class HostedReceiptDocumentReceiptNotFoundError extends Error {
  constructor() {
    super('The owner-scoped receipt was not found.');
    this.name = 'HostedReceiptDocumentReceiptNotFoundError';
  }
}

interface HostedReceiptDocumentRow {
  byte_size: string;
  created_at: string;
  height_pixels: number | null;
  id: string;
  is_original: boolean;
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
  FROM hosted_receipt_documents
`;

export class PostgresHostedReceiptDocumentRepository implements HostedReceiptDocumentRepository {
  readonly #pool: Pool;

  constructor(pool: Pool) {
    this.#pool = pool;
  }

  async createForOwner(ownerId: string, document: ReceiptDocument): Promise<ReceiptDocument> {
    assertUuid(ownerId, 'Owner ID');
    assertValidNewOriginal(document);

    try {
      await this.#pool.query(
        `
          INSERT INTO hosted_receipt_documents (
            id, owner_id, receipt_id, parent_document_id, storage_reference,
            original_filename, mime_type, byte_size, sha256, source_type,
            page_count, width_pixels, height_pixels, is_original, created_at,
            storage_deleted_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15, $16
          );
        `,
        [
          document.id,
          ownerId,
          document.receiptId,
          document.parentDocumentId,
          document.storageReference,
          document.originalFilename,
          document.mimeType,
          document.byteSize,
          document.sha256,
          document.sourceType,
          document.pageCount,
          document.widthPixels,
          document.heightPixels,
          document.isOriginal,
          document.createdAt,
          document.storageDeletedAt,
        ],
      );
      return { ...document };
    } catch (error) {
      if (hasSqlState(error, '23503')) {
        throw new HostedReceiptDocumentReceiptNotFoundError();
      }

      if (hasSqlState(error, '23505')) {
        throw new HostedReceiptDocumentDuplicateError();
      }

      throw error;
    }
  }

  async findOriginalByHashForOwner(
    ownerId: string,
    sha256: string,
  ): Promise<ReceiptDocument | null> {
    assertUuid(ownerId, 'Owner ID');
    assertSha256(sha256);
    const result = await this.#pool.query<HostedReceiptDocumentRow>(
      `${selectDocument}
       WHERE owner_id = $1 AND sha256 = $2 AND is_original
         AND storage_deleted_at IS NULL;`,
      [ownerId, sha256],
    );
    return result.rows[0] ? mapDocumentRow(result.rows[0]) : null;
  }

  async getByIdForOwner(
    ownerId: string,
    receiptId: string,
    documentId: string,
  ): Promise<ReceiptDocument | null> {
    assertUuid(ownerId, 'Owner ID');
    assertUuid(receiptId, 'Receipt ID');
    assertUuid(documentId, 'Document ID');
    const result = await this.#pool.query<HostedReceiptDocumentRow>(
      `${selectDocument}
       WHERE owner_id = $1 AND receipt_id = $2 AND id = $3
         AND storage_deleted_at IS NULL;`,
      [ownerId, receiptId, documentId],
    );
    return result.rows[0] ? mapDocumentRow(result.rows[0]) : null;
  }
}

function mapDocumentRow(row: HostedReceiptDocumentRow): ReceiptDocument {
  const issues: ReceiptDocumentValidationIssue[] = [];

  if (!isReceiptDocumentMimeType(row.mime_type)) {
    issues.push({ field: 'mimeType', message: 'Stored document MIME type is invalid.' });
  }

  if (!isReceiptDocumentSourceType(row.source_type)) {
    issues.push({ field: 'sourceType', message: 'Stored document source type is invalid.' });
  }

  if (
    issues.length > 0 ||
    !isReceiptDocumentMimeType(row.mime_type) ||
    !isReceiptDocumentSourceType(row.source_type)
  ) {
    throw new ReceiptDocumentValidationError(issues);
  }

  const byteSize = Number(row.byte_size);

  if (!/^\d+$/.test(row.byte_size) || !Number.isSafeInteger(byteSize)) {
    throw new ReceiptDocumentValidationError([
      { field: 'byteSize', message: 'Stored byte size exceeds the supported range.' },
    ]);
  }

  const document: ReceiptDocument = {
    byteSize,
    createdAt: row.created_at,
    heightPixels: row.height_pixels,
    id: row.id,
    isOriginal: row.is_original,
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

function assertValidNewOriginal(document: ReceiptDocument): void {
  assertValidDocument(document);

  if (!document.isOriginal || document.parentDocumentId !== null) {
    throw new TypeError('Hosted upload currently accepts original receipt documents only.');
  }

  if (document.storageDeletedAt !== null) {
    throw new TypeError('A new hosted receipt document cannot have deleted storage.');
  }
}

function assertValidDocument(document: ReceiptDocument): void {
  const issues = validateReceiptDocument(document);

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }
}

function assertUuid(value: string, label: string): void {
  if (!isUuid(value)) {
    throw new TypeError(`${label} must be a UUID.`);
  }
}

function assertSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError('SHA-256 must contain 64 lowercase hexadecimal characters.');
  }
}

function hasSqlState(error: unknown, sqlState: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === sqlState;
}
