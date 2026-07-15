// SPDX-License-Identifier: GPL-3.0-only
import { isUuid } from './receipt.js';

const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const safeCodePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const unsafeMetadataPattern = /[\u0000-\u001f\u007f]/;

export const evidenceFieldNames = [
  'merchant_name',
  'purchased_at',
  'currency_code',
  'subtotal_minor',
  'tax_minor',
  'tip_minor',
  'discount_minor',
  'total_minor',
] as const;

export type EvidenceFieldName = (typeof evidenceFieldNames)[number];

export const fieldEvidenceSourceTypes = [
  'manual',
  'local_ocr',
  'deterministic_parser',
  'hosted_ocr',
  'hosted_ai',
  'imported_structured_data',
  'user_correction',
] as const;

export type FieldEvidenceSourceType = (typeof fieldEvidenceSourceTypes)[number];

export interface NormalizedBoundingBox {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface FieldEvidence {
  readonly acceptedAt: string | null;
  readonly boundingBox: NormalizedBoundingBox | null;
  readonly confidence: number;
  readonly correctedAt: string | null;
  readonly extractedValue: string;
  readonly fieldName: EvidenceFieldName;
  readonly id: string;
  readonly normalizedValue: string;
  readonly pageNumber: number | null;
  readonly processedAt: string;
  readonly processorName: string;
  readonly processorVersion: string;
  readonly receiptId: string;
  readonly sourceType: FieldEvidenceSourceType;
}

export interface FieldEvidenceValidationIssue {
  readonly field: keyof FieldEvidence | 'boundingBox';
  readonly message: string;
}

export class FieldEvidenceValidationError extends Error {
  readonly issues: readonly FieldEvidenceValidationIssue[];

  constructor(issues: readonly FieldEvidenceValidationIssue[]) {
    super('Field evidence data is invalid.');
    this.name = 'FieldEvidenceValidationError';
    this.issues = issues;
  }
}

export function validateFieldEvidence(
  evidence: FieldEvidence,
): readonly FieldEvidenceValidationIssue[] {
  const issues: FieldEvidenceValidationIssue[] = [];

  validateUuid(evidence.id, 'id', issues);
  validateUuid(evidence.receiptId, 'receiptId', issues);

  if (!evidenceFieldNames.some((fieldName) => fieldName === evidence.fieldName)) {
    issues.push({ field: 'fieldName', message: 'Evidence field name is not supported.' });
  }

  validateBoundedText(evidence.extractedValue, 'extractedValue', 4_096, issues);
  validateBoundedText(evidence.normalizedValue, 'normalizedValue', 4_096, issues);
  validateSafeCode(evidence.processorName, 'processorName', issues);
  validateSafeCode(evidence.processorVersion, 'processorVersion', issues);

  if (!fieldEvidenceSourceTypes.some((sourceType) => sourceType === evidence.sourceType)) {
    issues.push({ field: 'sourceType', message: 'Evidence source type is not supported.' });
  }

  if (!Number.isFinite(evidence.confidence) || evidence.confidence < 0 || evidence.confidence > 1) {
    issues.push({ field: 'confidence', message: 'Confidence must be between 0 and 1.' });
  }

  if (
    evidence.pageNumber !== null &&
    (!Number.isSafeInteger(evidence.pageNumber) || evidence.pageNumber <= 0)
  ) {
    issues.push({ field: 'pageNumber', message: 'Page number must be a positive safe integer.' });
  }

  if (evidence.boundingBox !== null) {
    validateBoundingBox(evidence.boundingBox, issues);

    if (evidence.pageNumber === null) {
      issues.push({
        field: 'pageNumber',
        message: 'Evidence with a bounding box must identify its page.',
      });
    }
  }

  validateDateTime(evidence.processedAt, 'processedAt', false, issues);
  validateDateTime(evidence.acceptedAt, 'acceptedAt', true, issues);
  validateDateTime(evidence.correctedAt, 'correctedAt', true, issues);
  validateReviewChronology(evidence, issues);

  return issues;
}

export function assertValidFieldEvidence(evidence: FieldEvidence): void {
  const issues = validateFieldEvidence(evidence);

  if (issues.length > 0) {
    throw new FieldEvidenceValidationError(issues);
  }
}

export function canSupersedeFieldEvidence(
  candidate: FieldEvidence,
  existing: FieldEvidence,
): boolean {
  assertValidFieldEvidence(candidate);
  assertValidFieldEvidence(existing);

  if (candidate.receiptId !== existing.receiptId || candidate.fieldName !== existing.fieldName) {
    throw new TypeError('Evidence precedence requires the same receipt and field.');
  }

  const candidateAuthority = evidenceAuthority(candidate);
  const existingAuthority = evidenceAuthority(existing);

  return (
    candidateAuthority > existingAuthority ||
    (candidateAuthority === existingAuthority &&
      Date.parse(candidate.processedAt) > Date.parse(existing.processedAt))
  );
}

export const processingExecutionLocations = ['local', 'remote'] as const;
export type ProcessingExecutionLocation = (typeof processingExecutionLocations)[number];

export const processingStatuses = ['running', 'succeeded', 'failed', 'cancelled'] as const;
export type ProcessingStatus = (typeof processingStatuses)[number];

export const processingReviewStatuses = [
  'not_applicable',
  'pending',
  'accepted',
  'corrected',
] as const;
export type ProcessingReviewStatus = (typeof processingReviewStatuses)[number];

export interface ProcessingHistory {
  readonly affectedFields: readonly EvidenceFieldName[];
  readonly completedAt: string | null;
  readonly executionLocation: ProcessingExecutionLocation;
  readonly failureCode: string | null;
  readonly id: string;
  readonly modelVersion: string | null;
  readonly processorName: string;
  readonly processorVersion: string;
  readonly providerName: string;
  readonly receiptId: string;
  readonly reviewStatus: ProcessingReviewStatus;
  readonly startedAt: string;
  readonly status: ProcessingStatus;
}

export interface ProcessingHistoryValidationIssue {
  readonly field: keyof ProcessingHistory;
  readonly message: string;
}

export class ProcessingHistoryValidationError extends Error {
  readonly issues: readonly ProcessingHistoryValidationIssue[];

  constructor(issues: readonly ProcessingHistoryValidationIssue[]) {
    super('Processing history data is invalid.');
    this.name = 'ProcessingHistoryValidationError';
    this.issues = issues;
  }
}

export function validateProcessingHistory(
  history: ProcessingHistory,
): readonly ProcessingHistoryValidationIssue[] {
  const issues: ProcessingHistoryValidationIssue[] = [];

  validateUuid(history.id, 'id', issues);
  validateUuid(history.receiptId, 'receiptId', issues);
  validateSafeCode(history.processorName, 'processorName', issues);
  validateSafeCode(history.processorVersion, 'processorVersion', issues);
  validateSafeCode(history.providerName, 'providerName', issues);

  if (history.modelVersion !== null) {
    validateSafeCode(history.modelVersion, 'modelVersion', issues);
  }

  if (!processingExecutionLocations.some((location) => location === history.executionLocation)) {
    issues.push({
      field: 'executionLocation',
      message: 'Processing execution location is not supported.',
    });
  }

  if (!processingStatuses.some((status) => status === history.status)) {
    issues.push({ field: 'status', message: 'Processing status is not supported.' });
  }

  if (!processingReviewStatuses.some((status) => status === history.reviewStatus)) {
    issues.push({ field: 'reviewStatus', message: 'Processing review status is not supported.' });
  }

  validateAffectedFields(history.affectedFields, issues);
  validateDateTime(history.startedAt, 'startedAt', false, issues);
  validateDateTime(history.completedAt, 'completedAt', true, issues);
  validateProcessingLifecycle(history, issues);

  return issues;
}

export function assertValidProcessingHistory(history: ProcessingHistory): void {
  const issues = validateProcessingHistory(history);

  if (issues.length > 0) {
    throw new ProcessingHistoryValidationError(issues);
  }
}

function evidenceAuthority(evidence: FieldEvidence): number {
  if (evidence.sourceType === 'user_correction' || evidence.correctedAt !== null) {
    return 4;
  }

  if (evidence.sourceType === 'manual') {
    return 3;
  }

  if (evidence.acceptedAt !== null) {
    return 2;
  }

  return 1;
}

function validateBoundingBox(
  box: NormalizedBoundingBox,
  issues: FieldEvidenceValidationIssue[],
): void {
  const values = [box.x, box.y, box.width, box.height];
  const validValues = values.every((value) => Number.isFinite(value));

  if (
    !validValues ||
    box.x < 0 ||
    box.y < 0 ||
    box.width <= 0 ||
    box.height <= 0 ||
    box.x + box.width > 1 ||
    box.y + box.height > 1
  ) {
    issues.push({
      field: 'boundingBox',
      message: 'Bounding box coordinates must form a positive rectangle within the page.',
    });
  }
}

function validateReviewChronology(
  evidence: FieldEvidence,
  issues: FieldEvidenceValidationIssue[],
): void {
  const processedAt = Date.parse(evidence.processedAt);

  for (const field of ['acceptedAt', 'correctedAt'] as const) {
    const value = evidence[field];

    if (value !== null && !Number.isNaN(processedAt) && Date.parse(value) < processedAt) {
      issues.push({ field, message: 'Review time cannot be before processing time.' });
    }
  }
}

function validateAffectedFields(
  fields: readonly EvidenceFieldName[],
  issues: ProcessingHistoryValidationIssue[],
): void {
  if (
    fields.some((field) => !evidenceFieldNames.some((fieldName) => fieldName === field)) ||
    new Set(fields).size !== fields.length
  ) {
    issues.push({
      field: 'affectedFields',
      message: 'Affected fields must be unique supported evidence field names.',
    });
  }
}

function validateProcessingLifecycle(
  history: ProcessingHistory,
  issues: ProcessingHistoryValidationIssue[],
): void {
  if ((history.status === 'running') !== (history.completedAt === null)) {
    issues.push({
      field: 'completedAt',
      message: 'Only running processing may omit its completion time.',
    });
  }

  if ((history.status === 'failed') !== (history.failureCode !== null)) {
    issues.push({
      field: 'failureCode',
      message: 'Only failed processing must include a redacted failure code.',
    });
  }

  if (history.failureCode !== null && !safeCodePattern.test(history.failureCode)) {
    issues.push({
      field: 'failureCode',
      message: 'Failure code must contain only safe identifier characters.',
    });
  }

  if (
    history.completedAt !== null &&
    !Number.isNaN(Date.parse(history.startedAt)) &&
    Date.parse(history.completedAt) < Date.parse(history.startedAt)
  ) {
    issues.push({ field: 'completedAt', message: 'Completion time cannot precede start time.' });
  }

  if (history.status !== 'succeeded' && history.reviewStatus !== 'not_applicable') {
    issues.push({
      field: 'reviewStatus',
      message: 'Only successful processing can require or record field review.',
    });
  }
}

function validateUuid<T extends { readonly field: string; readonly message: string }>(
  value: string,
  field: T['field'],
  issues: T[],
): void {
  if (!isUuid(value)) {
    issues.push({ field, message: 'Identifier must be a UUID.' } as T);
  }
}

function validateBoundedText(
  value: string,
  field: 'extractedValue' | 'normalizedValue',
  maximumLength: number,
  issues: FieldEvidenceValidationIssue[],
): void {
  if (
    value.trim().length === 0 ||
    value.length > maximumLength ||
    unsafeMetadataPattern.test(value)
  ) {
    issues.push({
      field,
      message: `${field} must contain 1 to ${maximumLength} characters without control characters.`,
    });
  }
}

function validateSafeCode<
  T extends FieldEvidenceValidationIssue | ProcessingHistoryValidationIssue,
>(value: string, field: T['field'], issues: T[]): void {
  if (!safeCodePattern.test(value)) {
    issues.push({ field, message: 'Value must contain only safe identifier characters.' } as T);
  }
}

function validateDateTime<
  T extends FieldEvidenceValidationIssue | ProcessingHistoryValidationIssue,
>(value: string | null, field: T['field'], nullable: boolean, issues: T[]): void {
  if (value === null) {
    if (!nullable) {
      issues.push({ field, message: 'Timestamp is required.' } as T);
    }
    return;
  }

  if (!offsetDateTimePattern.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({
      field,
      message: 'Timestamp must be valid ISO 8601 with a timezone offset.',
    } as T);
  }
}
