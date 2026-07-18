// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidCategory,
  assertValidFieldEvidence,
  assertValidProcessingHistory,
  assertValidTag,
  evidenceFieldNames,
  isReceiptDocumentMimeType,
  isReceiptDocumentSourceType,
  isSupportedCurrencyCode,
  ReceiptDocumentValidationError,
  ReceiptValidationError,
  validateReceipt,
  validateReceiptDocument,
  type Category,
  type EvidenceFieldName,
  type FieldEvidence,
  type FieldEvidenceSourceType,
  type ProcessingExecutionLocation,
  type ProcessingHistory,
  type ProcessingReviewStatus,
  type ProcessingStatus,
  type Receipt,
  type ReceiptDocument,
  type Tag,
} from '@reimbursd/domain';
import type { ExportMerchant, ExportReceiptTag, StructuredExportRecords } from '@reimbursd/export';

import type { SqliteConnection } from './sqlite.js';

export interface StructuredExportSnapshotRepository {
  getActiveSnapshot(): Promise<StructuredExportRecords>;
}

interface CategoryRow {
  created_at: string;
  deleted_at: string | null;
  id: string;
  name: string;
  normalized_name: string;
  updated_at: string;
  version: number;
}

interface DocumentRow {
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

interface EvidenceRow {
  accepted_at: string | null;
  bounding_box_height: number | null;
  bounding_box_width: number | null;
  bounding_box_x: number | null;
  bounding_box_y: number | null;
  confidence: number;
  corrected_at: string | null;
  extracted_value: string;
  field_name: string;
  id: string;
  normalized_value: string;
  page_number: number | null;
  processed_at: string;
  processor_name: string;
  processor_version: string;
  receipt_id: string;
  source_type: string;
}

interface HistoryRow {
  affected_fields_json: string;
  completed_at: string | null;
  execution_location: string;
  failure_code: string | null;
  id: string;
  model_version: string | null;
  processor_name: string;
  processor_version: string;
  provider_name: string;
  receipt_id: string;
  review_status: string;
  started_at: string;
  status: string;
}

interface MerchantRow {
  created_at: string;
  display_name: string;
  id: string;
  normalized_name: string;
  phone: string | null;
  updated_at: string;
  website: string | null;
}

interface ReceiptRow {
  captured_at: string;
  category_id: string | null;
  created_at: string;
  currency_code: string;
  deleted_at: string | null;
  discount_minor: number;
  id: string;
  location_id: string | null;
  merchant_id: string;
  merchant_name: string;
  notes: string;
  purchased_at: string;
  source_type: string;
  subtotal_minor: number;
  tax_minor: number;
  tip_minor: number;
  total_minor: number;
  updated_at: string;
  version: number;
}

interface ReceiptTagRow {
  assigned_at: string;
  deleted_at: string | null;
  receipt_id: string;
  tag_id: string;
  updated_at: string;
  version: number;
}

export class SqliteStructuredExportSnapshotRepository implements StructuredExportSnapshotRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async getActiveSnapshot(): Promise<StructuredExportRecords> {
    return this.#connection.transaction(async () => {
      const receiptRows = await this.#connection.getAll<ReceiptRow>(`
        SELECT
          r.id, r.merchant_id, m.display_name AS merchant_name, r.location_id,
          r.purchased_at, r.captured_at, r.currency_code, r.subtotal_minor,
          r.tax_minor, r.tip_minor, r.discount_minor, r.total_minor, r.category_id,
          r.source_type, r.notes, r.created_at, r.updated_at, r.version, r.deleted_at
        FROM receipts r
        INNER JOIN merchants m ON m.id = r.merchant_id
        WHERE r.deleted_at IS NULL
        ORDER BY r.purchased_at, r.created_at, r.id;
      `);
      const merchantRows = await this.#connection.getAll<MerchantRow>(`
        SELECT m.id, m.display_name, m.normalized_name, m.website, m.phone,
               m.created_at, m.updated_at
        FROM merchants m
        WHERE EXISTS (
          SELECT 1 FROM receipts r
          WHERE r.merchant_id = m.id AND r.deleted_at IS NULL
        )
        ORDER BY m.normalized_name, m.id;
      `);
      const categoryRows = await this.#connection.getAll<CategoryRow>(`
        SELECT id, name, normalized_name, created_at, updated_at, version, deleted_at
        FROM categories
        WHERE deleted_at IS NULL
        ORDER BY normalized_name, id;
      `);
      const tagRows = await this.#connection.getAll<CategoryRow>(`
        SELECT id, name, normalized_name, created_at, updated_at, version, deleted_at
        FROM tags
        WHERE deleted_at IS NULL
        ORDER BY normalized_name, id;
      `);
      const receiptTagRows = await this.#connection.getAll<ReceiptTagRow>(`
        SELECT rt.receipt_id, rt.tag_id, rt.assigned_at, rt.updated_at,
               rt.version, rt.deleted_at
        FROM receipt_tags rt
        INNER JOIN receipts r ON r.id = rt.receipt_id
        INNER JOIN tags t ON t.id = rt.tag_id
        WHERE rt.deleted_at IS NULL AND r.deleted_at IS NULL AND t.deleted_at IS NULL
        ORDER BY rt.receipt_id, rt.tag_id;
      `);
      const documentRows = await this.#connection.getAll<DocumentRow>(`
        SELECT d.id, d.receipt_id, d.parent_document_id, d.storage_reference,
               d.original_filename, d.mime_type, d.byte_size, d.sha256, d.source_type,
               d.page_count, d.width_pixels, d.height_pixels, d.is_original,
               d.created_at, d.storage_deleted_at
        FROM receipt_documents d
        INNER JOIN receipts r ON r.id = d.receipt_id
        WHERE r.deleted_at IS NULL AND d.storage_deleted_at IS NULL AND d.is_original = 1
        ORDER BY d.receipt_id, d.is_original DESC, d.created_at, d.id;
      `);
      const evidenceRows = await this.#connection.getAll<EvidenceRow>(`
        SELECT e.id, e.receipt_id, e.field_name, e.extracted_value,
               e.normalized_value, e.source_type, e.processor_name,
               e.processor_version, e.confidence, e.page_number, e.bounding_box_x,
               e.bounding_box_y, e.bounding_box_width, e.bounding_box_height,
               e.processed_at, e.accepted_at, e.corrected_at
        FROM field_evidence e
        INNER JOIN receipts r ON r.id = e.receipt_id
        WHERE r.deleted_at IS NULL
        ORDER BY e.receipt_id, e.processed_at, e.id;
      `);
      const historyRows = await this.#connection.getAll<HistoryRow>(`
        SELECT h.id, h.receipt_id, h.processor_name, h.processor_version,
               h.execution_location, h.provider_name, h.model_version, h.started_at,
               h.completed_at, h.status, h.failure_code, h.affected_fields_json,
               h.review_status
        FROM processing_history h
        INNER JOIN receipts r ON r.id = h.receipt_id
        WHERE r.deleted_at IS NULL
        ORDER BY h.receipt_id, h.started_at, h.id;
      `);

      return {
        categories: categoryRows.map(mapCategoryRow),
        fieldEvidence: evidenceRows.map(mapEvidenceRow),
        merchants: merchantRows.map(mapMerchantRow),
        processingHistory: historyRows.map(mapHistoryRow),
        receiptDocuments: documentRows.map(mapDocumentRow),
        receiptTags: receiptTagRows.map(mapReceiptTagRow),
        receipts: receiptRows.map(mapReceiptRow),
        tags: tagRows.map(mapTagRow),
      };
    });
  }
}

function mapCategoryRow(row: CategoryRow): Category {
  const category = mapClassificationRow(row);
  assertValidCategory(category);
  return category;
}

function mapTagRow(row: CategoryRow): Tag {
  const tag = mapClassificationRow(row);
  assertValidTag(tag);
  return tag;
}

function mapClassificationRow(row: CategoryRow): Category {
  return {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapMerchantRow(row: MerchantRow): ExportMerchant {
  return {
    createdAt: row.created_at,
    displayName: row.display_name,
    id: row.id,
    normalizedName: row.normalized_name,
    phone: row.phone,
    updatedAt: row.updated_at,
    website: row.website,
  };
}

function mapReceiptRow(row: ReceiptRow): Receipt {
  if (!isSupportedCurrencyCode(row.currency_code) || row.source_type !== 'manual') {
    throw new Error('Stored receipt contains unsupported enum data.');
  }

  const receipt: Receipt = {
    capturedAt: row.captured_at,
    categoryId: row.category_id,
    createdAt: row.created_at,
    currencyCode: row.currency_code,
    deletedAt: row.deleted_at,
    discountMinor: row.discount_minor,
    id: row.id,
    locationId: row.location_id,
    merchantId: row.merchant_id,
    merchantName: row.merchant_name,
    notes: row.notes,
    purchasedAt: row.purchased_at,
    sourceType: row.source_type,
    subtotalMinor: row.subtotal_minor,
    taxMinor: row.tax_minor,
    tipMinor: row.tip_minor,
    totalMinor: row.total_minor,
    updatedAt: row.updated_at,
    version: row.version,
  };
  const issues = validateReceipt(receipt);

  if (issues.length > 0) {
    throw new ReceiptValidationError(issues);
  }

  return receipt;
}

function mapReceiptTagRow(row: ReceiptTagRow): ExportReceiptTag {
  return {
    assignedAt: row.assigned_at,
    deletedAt: row.deleted_at,
    receiptId: row.receipt_id,
    tagId: row.tag_id,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

function mapDocumentRow(row: DocumentRow): ReceiptDocument {
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
  const issues = validateReceiptDocument(document);

  if (issues.length > 0) {
    throw new ReceiptDocumentValidationError(issues);
  }

  return document;
}

function mapEvidenceRow(row: EvidenceRow): FieldEvidence {
  const evidence: FieldEvidence = {
    acceptedAt: row.accepted_at,
    boundingBox:
      row.bounding_box_x === null ||
      row.bounding_box_y === null ||
      row.bounding_box_width === null ||
      row.bounding_box_height === null
        ? null
        : {
            height: row.bounding_box_height,
            width: row.bounding_box_width,
            x: row.bounding_box_x,
            y: row.bounding_box_y,
          },
    confidence: row.confidence,
    correctedAt: row.corrected_at,
    extractedValue: row.extracted_value,
    fieldName: row.field_name as EvidenceFieldName,
    id: row.id,
    normalizedValue: row.normalized_value,
    pageNumber: row.page_number,
    processedAt: row.processed_at,
    processorName: row.processor_name,
    processorVersion: row.processor_version,
    receiptId: row.receipt_id,
    sourceType: row.source_type as FieldEvidenceSourceType,
  };
  assertValidFieldEvidence(evidence);
  return evidence;
}

function mapHistoryRow(row: HistoryRow): ProcessingHistory {
  const history: ProcessingHistory = {
    affectedFields: parseAffectedFields(row.affected_fields_json),
    completedAt: row.completed_at,
    executionLocation: row.execution_location as ProcessingExecutionLocation,
    failureCode: row.failure_code,
    id: row.id,
    modelVersion: row.model_version,
    processorName: row.processor_name,
    processorVersion: row.processor_version,
    providerName: row.provider_name,
    receiptId: row.receipt_id,
    reviewStatus: row.review_status as ProcessingReviewStatus,
    startedAt: row.started_at,
    status: row.status as ProcessingStatus,
  };
  assertValidProcessingHistory(history);
  return history;
}

function parseAffectedFields(value: string): readonly EvidenceFieldName[] {
  const parsed: unknown = JSON.parse(value);

  if (
    !Array.isArray(parsed) ||
    parsed.some(
      (field) =>
        typeof field !== 'string' ||
        !evidenceFieldNames.some((supportedField) => supportedField === field),
    )
  ) {
    throw new TypeError('Stored affected fields are invalid.');
  }

  return parsed as EvidenceFieldName[];
}
