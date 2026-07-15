// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidFieldEvidence,
  assertValidProcessingHistory,
  canSupersedeFieldEvidence,
  type EvidenceFieldName,
  type FieldEvidence,
  type FieldEvidenceSourceType,
  type ProcessingExecutionLocation,
  type ProcessingHistory,
  type ProcessingReviewStatus,
  type ProcessingStatus,
} from '@reimbursd/domain';

import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface FieldEvidenceRepository {
  create(evidence: FieldEvidence): Promise<FieldEvidence>;
  getPreferred(receiptId: string, fieldName: EvidenceFieldName): Promise<FieldEvidence | null>;
  listByReceiptId(
    receiptId: string,
    fieldName?: EvidenceFieldName,
  ): Promise<readonly FieldEvidence[]>;
}

export interface CompleteProcessingHistoryInput {
  readonly affectedFields: readonly EvidenceFieldName[];
  readonly completedAt: string;
  readonly failureCode: string | null;
  readonly id: string;
  readonly reviewStatus: ProcessingReviewStatus;
  readonly status: Exclude<ProcessingStatus, 'running'>;
}

export interface ProcessingHistoryRepository {
  complete(input: CompleteProcessingHistoryInput): Promise<ProcessingHistory>;
  create(history: ProcessingHistory): Promise<ProcessingHistory>;
  getById(id: string): Promise<ProcessingHistory | null>;
  listByReceiptId(receiptId: string): Promise<readonly ProcessingHistory[]>;
}

export class ProcessingReceiptNotFoundError extends Error {
  constructor() {
    super('An active receipt is required for processing provenance.');
    this.name = 'ProcessingReceiptNotFoundError';
  }
}

export class ProcessingHistoryNotFoundError extends Error {
  constructor() {
    super('Processing history was not found.');
    this.name = 'ProcessingHistoryNotFoundError';
  }
}

export class ProcessingHistoryConflictError extends Error {
  constructor() {
    super('Processing history is no longer running.');
    this.name = 'ProcessingHistoryConflictError';
  }
}

interface FieldEvidenceRow {
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

interface ProcessingHistoryRow {
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

const selectEvidence = `
  SELECT
    id, receipt_id, field_name, extracted_value, normalized_value, source_type,
    processor_name, processor_version, confidence, page_number, bounding_box_x,
    bounding_box_y, bounding_box_width, bounding_box_height, processed_at,
    accepted_at, corrected_at
  FROM field_evidence
`;

const selectHistory = `
  SELECT
    id, receipt_id, processor_name, processor_version, execution_location,
    provider_name, model_version, started_at, completed_at, status, failure_code,
    affected_fields_json, review_status
  FROM processing_history
`;

export class SqliteFieldEvidenceRepository implements FieldEvidenceRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async create(evidence: FieldEvidence): Promise<FieldEvidence> {
    assertValidFieldEvidence(evidence);

    return this.#connection.transaction(async () => {
      await assertActiveReceipt(this.#connection, evidence.receiptId);
      await this.#connection.run(
        `
          INSERT INTO field_evidence (
            id, receipt_id, field_name, extracted_value, normalized_value, source_type,
            processor_name, processor_version, confidence, page_number, bounding_box_x,
            bounding_box_y, bounding_box_width, bounding_box_height, processed_at,
            accepted_at, corrected_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        evidenceParameters(evidence),
      );
      return evidence;
    });
  }

  async getPreferred(
    receiptId: string,
    fieldName: EvidenceFieldName,
  ): Promise<FieldEvidence | null> {
    const evidence = await this.listByReceiptId(receiptId, fieldName);

    return evidence.reduce<FieldEvidence | null>((preferred, candidate) => {
      if (preferred === null || canSupersedeFieldEvidence(candidate, preferred)) {
        return candidate;
      }
      return preferred;
    }, null);
  }

  async listByReceiptId(
    receiptId: string,
    fieldName?: EvidenceFieldName,
  ): Promise<readonly FieldEvidence[]> {
    const rows = await this.#connection.getAll<FieldEvidenceRow>(
      fieldName === undefined
        ? `${selectEvidence} WHERE receipt_id = ? ORDER BY processed_at, id;`
        : `${selectEvidence} WHERE receipt_id = ? AND field_name = ? ORDER BY processed_at, id;`,
      fieldName === undefined ? [receiptId] : [receiptId, fieldName],
    );

    return rows.map(mapEvidenceRow);
  }
}

export class SqliteProcessingHistoryRepository implements ProcessingHistoryRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async complete(input: CompleteProcessingHistoryInput): Promise<ProcessingHistory> {
    return this.#connection.transaction(async () => {
      const existing = await this.getById(input.id);

      if (existing === null) {
        throw new ProcessingHistoryNotFoundError();
      }

      if (existing.status !== 'running') {
        throw new ProcessingHistoryConflictError();
      }

      const completed: ProcessingHistory = {
        ...existing,
        affectedFields: [...input.affectedFields],
        completedAt: input.completedAt,
        failureCode: input.failureCode,
        reviewStatus: input.reviewStatus,
        status: input.status,
      };
      assertValidProcessingHistory(completed);
      const result = await this.#connection.run(
        `
          UPDATE processing_history
          SET completed_at = ?, status = ?, failure_code = ?,
              affected_fields_json = ?, review_status = ?
          WHERE id = ? AND status = 'running';
        `,
        [
          completed.completedAt,
          completed.status,
          completed.failureCode,
          JSON.stringify(completed.affectedFields),
          completed.reviewStatus,
          completed.id,
        ],
      );

      if (result.changes !== 1) {
        throw new ProcessingHistoryConflictError();
      }

      return completed;
    });
  }

  async create(history: ProcessingHistory): Promise<ProcessingHistory> {
    assertValidProcessingHistory(history);

    return this.#connection.transaction(async () => {
      await assertActiveReceipt(this.#connection, history.receiptId);
      await this.#connection.run(
        `
          INSERT INTO processing_history (
            id, receipt_id, processor_name, processor_version, execution_location,
            provider_name, model_version, started_at, completed_at, status, failure_code,
            affected_fields_json, review_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        historyParameters(history),
      );
      return history;
    });
  }

  async getById(id: string): Promise<ProcessingHistory | null> {
    const row = await this.#connection.getFirst<ProcessingHistoryRow>(
      `${selectHistory} WHERE id = ?;`,
      [id],
    );

    return row === null ? null : mapHistoryRow(row);
  }

  async listByReceiptId(receiptId: string): Promise<readonly ProcessingHistory[]> {
    const rows = await this.#connection.getAll<ProcessingHistoryRow>(
      `${selectHistory} WHERE receipt_id = ? ORDER BY started_at, id;`,
      [receiptId],
    );

    return rows.map(mapHistoryRow);
  }
}

async function assertActiveReceipt(connection: SqliteConnection, receiptId: string): Promise<void> {
  const receipt = await connection.getFirst<{ id: string }>(
    'SELECT id FROM receipts WHERE id = ? AND deleted_at IS NULL;',
    [receiptId],
  );

  if (receipt === null) {
    throw new ProcessingReceiptNotFoundError();
  }
}

function mapEvidenceRow(row: FieldEvidenceRow): FieldEvidence {
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

function mapHistoryRow(row: ProcessingHistoryRow): ProcessingHistory {
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

  if (!Array.isArray(parsed)) {
    throw new TypeError('Stored affected fields are invalid.');
  }

  return parsed as EvidenceFieldName[];
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
