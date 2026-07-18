// SPDX-License-Identifier: GPL-3.0-only
import type { FieldEvidence, ProcessingHistory, Receipt, ReceiptDocument } from '@reimbursd/domain';
import {
  assertValidStructuredExportRecords,
  type ExportMerchant,
  type ExportReceiptTag,
  type StructuredExportRecords,
} from '@reimbursd/export';

import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface StructuredImportResult {
  readonly attachmentDocumentCount: number;
  readonly categoryCount: number;
  readonly evidenceCount: number;
  readonly processingHistoryCount: number;
  readonly receiptCount: number;
  readonly tagCount: number;
}

export interface StructuredImportRepository {
  restoreClean(records: StructuredExportRecords): Promise<StructuredImportResult>;
}

export class StructuredImportTargetNotEmptyError extends Error {
  constructor() {
    super('Restore requires an empty local Reimbursd database.');
    this.name = 'StructuredImportTargetNotEmptyError';
  }
}

export class StructuredImportUnsupportedRecordsError extends Error {
  constructor() {
    super('This export contains document derivatives that cannot be restored.');
    this.name = 'StructuredImportUnsupportedRecordsError';
  }
}

export class SqliteStructuredImportRepository implements StructuredImportRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async restoreClean(records: StructuredExportRecords): Promise<StructuredImportResult> {
    assertValidStructuredExportRecords(records);

    if (records.receiptDocuments.some(({ isOriginal }) => !isOriginal)) {
      throw new StructuredImportUnsupportedRecordsError();
    }

    return this.#connection.transaction(async () => {
      const existing = await this.#connection.getFirst<{ record_count: number }>(`
        SELECT
          (SELECT COUNT(*) FROM merchants)
          + (SELECT COUNT(*) FROM receipts)
          + (SELECT COUNT(*) FROM receipt_documents)
          + (SELECT COUNT(*) FROM field_evidence)
          + (SELECT COUNT(*) FROM processing_history)
          + (SELECT COUNT(*) FROM categories)
          + (SELECT COUNT(*) FROM tags)
          + (SELECT COUNT(*) FROM receipt_tags)
          + (SELECT COUNT(*) FROM local_data_deletion)
          AS record_count;
      `);

      if (existing === null || existing.record_count !== 0) {
        throw new StructuredImportTargetNotEmptyError();
      }

      for (const merchant of records.merchants) {
        await this.#connection.run(
          `INSERT INTO merchants (
             id, display_name, normalized_name, website, phone, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
          merchantParameters(merchant),
        );
      }

      for (const category of records.categories) {
        await this.#connection.run(
          `INSERT INTO categories (
             id, name, normalized_name, created_at, updated_at, version, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            category.id,
            category.name,
            category.normalizedName,
            category.createdAt,
            category.updatedAt,
            category.version,
            category.deletedAt,
          ],
        );
      }

      for (const tag of records.tags) {
        await this.#connection.run(
          `INSERT INTO tags (
             id, name, normalized_name, created_at, updated_at, version, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
          [
            tag.id,
            tag.name,
            tag.normalizedName,
            tag.createdAt,
            tag.updatedAt,
            tag.version,
            tag.deletedAt,
          ],
        );
      }

      for (const receipt of records.receipts) {
        await this.#connection.run(
          `INSERT INTO receipts (
             id, merchant_id, location_id, purchased_at, captured_at, currency_code,
             subtotal_minor, tax_minor, tip_minor, discount_minor, total_minor,
             category_id, source_type, notes, created_at, updated_at, version, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          receiptParameters(receipt),
        );
      }

      for (const receiptTag of records.receiptTags) {
        await this.#connection.run(
          `INSERT INTO receipt_tags (
             receipt_id, tag_id, assigned_at, updated_at, version, deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?);`,
          receiptTagParameters(receiptTag),
        );
      }

      for (const document of records.receiptDocuments) {
        await this.#connection.run(
          `INSERT INTO receipt_documents (
             id, receipt_id, parent_document_id, storage_reference, original_filename,
             mime_type, byte_size, sha256, page_count, width_pixels, height_pixels,
             is_original, created_at, source_type, storage_deleted_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          documentParameters(document),
        );
      }

      for (const evidence of records.fieldEvidence) {
        await this.#connection.run(
          `INSERT INTO field_evidence (
             id, receipt_id, field_name, extracted_value, normalized_value, source_type,
             processor_name, processor_version, confidence, page_number, bounding_box_x,
             bounding_box_y, bounding_box_width, bounding_box_height, processed_at,
             accepted_at, corrected_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          evidenceParameters(evidence),
        );
      }

      for (const history of records.processingHistory) {
        await this.#connection.run(
          `INSERT INTO processing_history (
             id, receipt_id, processor_name, processor_version, execution_location,
             provider_name, model_version, started_at, completed_at, status, failure_code,
             affected_fields_json, review_status
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          historyParameters(history),
        );
      }

      return {
        attachmentDocumentCount: records.receiptDocuments.length,
        categoryCount: records.categories.length,
        evidenceCount: records.fieldEvidence.length,
        processingHistoryCount: records.processingHistory.length,
        receiptCount: records.receipts.length,
        tagCount: records.tags.length,
      };
    });
  }
}

function merchantParameters(merchant: ExportMerchant): readonly SqliteValue[] {
  return [
    merchant.id,
    merchant.displayName,
    merchant.normalizedName,
    merchant.website,
    merchant.phone,
    merchant.createdAt,
    merchant.updatedAt,
  ];
}

function receiptParameters(receipt: Receipt): readonly SqliteValue[] {
  return [
    receipt.id,
    receipt.merchantId,
    receipt.locationId,
    receipt.purchasedAt,
    receipt.capturedAt,
    receipt.currencyCode,
    receipt.subtotalMinor,
    receipt.taxMinor,
    receipt.tipMinor,
    receipt.discountMinor,
    receipt.totalMinor,
    receipt.categoryId,
    receipt.sourceType,
    receipt.notes,
    receipt.createdAt,
    receipt.updatedAt,
    receipt.version,
    receipt.deletedAt,
  ];
}

function receiptTagParameters(receiptTag: ExportReceiptTag): readonly SqliteValue[] {
  return [
    receiptTag.receiptId,
    receiptTag.tagId,
    receiptTag.assignedAt,
    receiptTag.updatedAt,
    receiptTag.version,
    receiptTag.deletedAt,
  ];
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

function evidenceParameters(evidence: FieldEvidence): readonly SqliteValue[] {
  return [
    evidence.id,
    evidence.receiptId,
    evidence.fieldName,
    evidence.extractedValue,
    evidence.normalizedValue,
    evidence.sourceType,
    evidence.processorName,
    evidence.processorVersion,
    evidence.confidence,
    evidence.pageNumber,
    evidence.boundingBox?.x ?? null,
    evidence.boundingBox?.y ?? null,
    evidence.boundingBox?.width ?? null,
    evidence.boundingBox?.height ?? null,
    evidence.processedAt,
    evidence.acceptedAt,
    evidence.correctedAt,
  ];
}

function historyParameters(history: ProcessingHistory): readonly SqliteValue[] {
  return [
    history.id,
    history.receiptId,
    history.processorName,
    history.processorVersion,
    history.executionLocation,
    history.providerName,
    history.modelVersion,
    history.startedAt,
    history.completedAt,
    history.status,
    history.failureCode,
    JSON.stringify(history.affectedFields),
    history.reviewStatus,
  ];
}
