// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidFieldEvidence,
  evidenceFieldNames,
  getPurchaseDate,
  isUuid,
  isSupportedCurrencyCode,
  validateReceipt,
  ReceiptValidationError,
  type EvidenceFieldName,
  type FieldEvidence,
  type Receipt,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface ReceiptListOptions {
  readonly categoryId?: string | null;
  readonly currencyCode?: SupportedCurrencyCode | null;
  readonly maximumTotalMinor?: number;
  readonly minimumTotalMinor?: number;
  readonly purchasedFrom?: string;
  readonly purchasedTo?: string;
  readonly search?: string;
  readonly tagId?: string;
}

export interface UpdateReceiptInput {
  readonly currencyCode: SupportedCurrencyCode;
  readonly discountMinor: number;
  readonly expectedVersion: number;
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchasedAt: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly tipMinor: number;
  readonly totalMinor: number;
  readonly updatedAt: string;
}

export interface ReceiptRepository {
  create(receipt: Receipt): Promise<Receipt>;
  delete(id: string, expectedVersion: number, deletedAt: string): Promise<Receipt>;
  getById(id: string): Promise<Receipt | null>;
  list(options?: ReceiptListOptions): Promise<readonly Receipt[]>;
  update(input: UpdateReceiptInput): Promise<Receipt>;
}

export interface EvidenceReviewInput {
  readonly evidenceId: string;
  readonly reviewedAt: string;
  readonly status: 'accepted' | 'corrected';
}

export interface ReviewReceiptInput {
  readonly corrections: readonly FieldEvidence[];
  readonly evidenceReviews: readonly EvidenceReviewInput[];
  readonly processingHistoryIds: readonly string[];
  readonly update: UpdateReceiptInput;
}

export interface ReceiptReviewRepository {
  review(input: ReviewReceiptInput): Promise<Receipt>;
}

export class ReceiptNotFoundError extends Error {
  constructor() {
    super('Receipt was not found.');
    this.name = 'ReceiptNotFoundError';
  }
}

export class ReceiptConflictError extends Error {
  constructor() {
    super('Receipt changed since it was opened. Reload it before saving.');
    this.name = 'ReceiptConflictError';
  }
}

export class ReceiptReviewConflictError extends Error {
  constructor() {
    super('Receipt suggestions changed since review began. Reload them before saving.');
    this.name = 'ReceiptReviewConflictError';
  }
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

const selectReceipt = `
  SELECT
    r.id,
    r.merchant_id,
    m.display_name AS merchant_name,
    r.location_id,
    r.purchased_at,
    r.captured_at,
    r.currency_code,
    r.subtotal_minor,
    r.tax_minor,
    r.tip_minor,
    r.discount_minor,
    r.total_minor,
    r.category_id,
    r.source_type,
    r.notes,
    r.created_at,
    r.updated_at,
    r.version,
    r.deleted_at
  FROM receipts r
  INNER JOIN merchants m ON m.id = r.merchant_id
`;

export class SqliteReceiptRepository implements ReceiptRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async create(receipt: Receipt): Promise<Receipt> {
    assertValidReceipt(receipt);

    return this.#connection.transaction(async () => {
      const merchantId = await upsertMerchant(
        this.#connection,
        receipt.merchantId,
        receipt.merchantName,
        receipt.createdAt,
      );
      const storedReceipt = { ...receipt, merchantId };

      await this.#connection.run(
        `
          INSERT INTO receipts (
            id, merchant_id, location_id, purchased_at, captured_at, currency_code,
            subtotal_minor, tax_minor, tip_minor, discount_minor, total_minor,
            category_id, source_type, notes, created_at, updated_at, version, deleted_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        `,
        receiptParameters(storedReceipt),
      );

      return storedReceipt;
    });
  }

  async delete(id: string, expectedVersion: number, deletedAt: string): Promise<Receipt> {
    return this.#connection.transaction(async () => {
      const existing = await requireActiveReceipt(this.#connection, id);
      assertExpectedVersion(existing, expectedVersion);
      const deletedReceipt: Receipt = {
        ...existing,
        deletedAt,
        updatedAt: deletedAt,
        version: existing.version + 1,
      };
      assertValidReceipt(deletedReceipt);

      const result = await this.#connection.run(
        `
          UPDATE receipts
          SET deleted_at = ?, updated_at = ?, version = version + 1
          WHERE id = ? AND version = ? AND deleted_at IS NULL;
        `,
        [deletedAt, deletedAt, id, expectedVersion],
      );

      if (result.changes !== 1) {
        throw new ReceiptConflictError();
      }

      return deletedReceipt;
    });
  }

  async getById(id: string): Promise<Receipt | null> {
    const row = await this.#connection.getFirst<ReceiptRow>(
      `${selectReceipt} WHERE r.id = ? AND r.deleted_at IS NULL;`,
      [id],
    );

    return row === null ? null : mapReceiptRow(row);
  }

  async list(options: ReceiptListOptions = {}): Promise<readonly Receipt[]> {
    validateReceiptListOptions(options);

    const conditions = ['r.deleted_at IS NULL'];
    const parameters: SqliteValue[] = [];
    const normalizedSearch = normalizeMerchantName(options.search ?? '');

    if (normalizedSearch.length > 0) {
      conditions.push("m.normalized_name LIKE ? ESCAPE '\\'");
      parameters.push(`%${escapeLikePattern(normalizedSearch)}%`);
    }

    if (options.currencyCode !== undefined && options.currencyCode !== null) {
      conditions.push('r.currency_code = ?');
      parameters.push(options.currencyCode);
    }

    if (options.purchasedFrom !== undefined) {
      conditions.push('substr(r.purchased_at, 1, 10) >= ?');
      parameters.push(options.purchasedFrom);
    }

    if (options.purchasedTo !== undefined) {
      conditions.push('substr(r.purchased_at, 1, 10) <= ?');
      parameters.push(options.purchasedTo);
    }

    if (options.minimumTotalMinor !== undefined) {
      conditions.push('r.total_minor >= ?');
      parameters.push(options.minimumTotalMinor);
    }

    if (options.maximumTotalMinor !== undefined) {
      conditions.push('r.total_minor <= ?');
      parameters.push(options.maximumTotalMinor);
    }

    if (options.categoryId === null) {
      conditions.push('r.category_id IS NULL');
    } else if (options.categoryId !== undefined) {
      conditions.push('r.category_id = ?');
      parameters.push(options.categoryId);
    }

    if (options.tagId !== undefined) {
      conditions.push(`EXISTS (
        SELECT 1
        FROM receipt_tags rt
        INNER JOIN tags t ON t.id = rt.tag_id
        WHERE rt.receipt_id = r.id AND rt.tag_id = ?
          AND rt.deleted_at IS NULL AND t.deleted_at IS NULL
      )`);
      parameters.push(options.tagId);
    }

    const rows = await this.#connection.getAll<ReceiptRow>(
      `${selectReceipt}
       WHERE ${conditions.join(' AND ')}
       ORDER BY r.purchased_at DESC, r.created_at DESC, r.id ASC;`,
      parameters,
    );

    return rows.map(mapReceiptRow);
  }

  async update(input: UpdateReceiptInput): Promise<Receipt> {
    return this.#connection.transaction(() => updateReceipt(this.#connection, input));
  }
}

interface EvidenceReviewRow {
  accepted_at: string | null;
  corrected_at: string | null;
  field_name: string;
  normalized_value: string;
  processed_at: string;
  receipt_id: string;
  source_type: string;
}

interface ProcessingReviewRow {
  receipt_id: string;
  review_status: string;
  status: string;
}

export class SqliteReceiptReviewRepository implements ReceiptReviewRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async review(input: ReviewReceiptInput): Promise<Receipt> {
    validateReviewInput(input);

    return this.#connection.transaction(async () => {
      const evidenceDecisions = await this.#validateReviewedEvidence(input);
      const existing = await requireActiveReceipt(this.#connection, input.update.id);
      assertExpectedVersion(existing, input.update.expectedVersion);
      validateCorrectionCoverage(input, existing, evidenceDecisions);
      const reviewStatus = getProcessingReviewStatus(input.evidenceReviews);
      await this.#validateProcessingHistory(input);
      const receipt = await updateReceipt(this.#connection, input.update);

      for (const review of input.evidenceReviews) {
        const column = review.status === 'accepted' ? 'accepted_at' : 'corrected_at';
        const result = await this.#connection.run(
          `UPDATE field_evidence
           SET ${column} = ?
           WHERE id = ? AND receipt_id = ? AND accepted_at IS NULL AND corrected_at IS NULL;`,
          [review.reviewedAt, review.evidenceId, input.update.id],
        );

        if (result.changes !== 1) {
          throw new ReceiptReviewConflictError();
        }
      }

      for (const correction of input.corrections) {
        await this.#connection.run(
          `
            INSERT INTO field_evidence (
              id, receipt_id, field_name, extracted_value, normalized_value, source_type,
              processor_name, processor_version, confidence, page_number, bounding_box_x,
              bounding_box_y, bounding_box_width, bounding_box_height, processed_at,
              accepted_at, corrected_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, ?, ?, ?);
          `,
          [
            correction.id,
            correction.receiptId,
            correction.fieldName,
            correction.extractedValue,
            correction.normalizedValue,
            correction.sourceType,
            correction.processorName,
            correction.processorVersion,
            correction.confidence,
            correction.processedAt,
            correction.acceptedAt,
            correction.correctedAt,
          ],
        );
      }

      for (const historyId of input.processingHistoryIds) {
        const result = await this.#connection.run(
          `UPDATE processing_history
           SET review_status = ?
           WHERE id = ? AND receipt_id = ? AND status = 'succeeded' AND review_status = 'pending';`,
          [reviewStatus, historyId, input.update.id],
        );

        if (result.changes !== 1) {
          throw new ReceiptReviewConflictError();
        }
      }

      return receipt;
    });
  }

  async #validateReviewedEvidence(
    input: ReviewReceiptInput,
  ): Promise<ReadonlyMap<EvidenceFieldName, EvidenceReviewInput['status']>> {
    const corrections = new Map(input.corrections.map((item) => [item.fieldName, item]));
    const decisions = new Map<EvidenceFieldName, EvidenceReviewInput['status']>();

    for (const review of input.evidenceReviews) {
      const row = await this.#connection.getFirst<EvidenceReviewRow>(
        `SELECT receipt_id, field_name, normalized_value, source_type, processed_at,
                accepted_at, corrected_at
         FROM field_evidence WHERE id = ?;`,
        [review.evidenceId],
      );

      if (
        row === null ||
        row.receipt_id !== input.update.id ||
        row.accepted_at !== null ||
        row.corrected_at !== null ||
        row.source_type === 'manual' ||
        row.source_type === 'user_correction' ||
        Date.parse(review.reviewedAt) < Date.parse(row.processed_at)
      ) {
        throw new ReceiptReviewConflictError();
      }

      const fieldName = row.field_name as EvidenceFieldName;
      if (decisions.has(fieldName)) {
        throw new TypeError('Only one evidence candidate may be reviewed for each field.');
      }
      if (
        review.status === 'accepted' &&
        !evidenceMatchesUpdate(fieldName, row.normalized_value, input.update)
      ) {
        throw new ReceiptReviewConflictError();
      }

      if (review.status === 'corrected' && corrections.get(fieldName) === undefined) {
        throw new TypeError('Corrected evidence requires authoritative correction evidence.');
      }
      if (review.status === 'accepted' && corrections.has(fieldName)) {
        throw new TypeError('Accepted evidence cannot also be recorded as corrected.');
      }

      decisions.set(fieldName, review.status);
    }

    return decisions;
  }

  async #validateProcessingHistory(input: ReviewReceiptInput): Promise<void> {
    if (input.processingHistoryIds.length > 0 && input.evidenceReviews.length === 0) {
      throw new TypeError('Processing history cannot be reviewed without field evidence.');
    }

    for (const historyId of input.processingHistoryIds) {
      const row = await this.#connection.getFirst<ProcessingReviewRow>(
        'SELECT receipt_id, status, review_status FROM processing_history WHERE id = ?;',
        [historyId],
      );

      if (
        row === null ||
        row.receipt_id !== input.update.id ||
        row.status !== 'succeeded' ||
        row.review_status !== 'pending'
      ) {
        throw new ReceiptReviewConflictError();
      }
    }
  }
}

function assertExpectedVersion(receipt: Receipt, expectedVersion: number): void {
  if (receipt.version !== expectedVersion) {
    throw new ReceiptConflictError();
  }
}

function assertValidReceipt(receipt: Receipt): void {
  const issues = validateReceipt(receipt);

  if (issues.length > 0) {
    throw new ReceiptValidationError(issues);
  }
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function validateReceiptListOptions(options: ReceiptListOptions): void {
  if (
    options.currencyCode !== undefined &&
    options.currencyCode !== null &&
    !isSupportedCurrencyCode(options.currencyCode)
  ) {
    throw new TypeError('Currency filter is not supported.');
  }

  if (
    options.categoryId !== undefined &&
    options.categoryId !== null &&
    !isUuid(options.categoryId)
  ) {
    throw new TypeError('Category filter must be a UUID.');
  }

  if (options.tagId !== undefined && !isUuid(options.tagId)) {
    throw new TypeError('Tag filter must be a UUID.');
  }

  for (const value of [options.minimumTotalMinor, options.maximumTotalMinor]) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError('Amount filters must be nonnegative safe integer minor units.');
    }
  }

  if (
    options.minimumTotalMinor !== undefined &&
    options.maximumTotalMinor !== undefined &&
    options.minimumTotalMinor > options.maximumTotalMinor
  ) {
    throw new RangeError('Minimum amount cannot exceed maximum amount.');
  }

  if (
    (options.minimumTotalMinor !== undefined || options.maximumTotalMinor !== undefined) &&
    (options.currencyCode === undefined || options.currencyCode === null)
  ) {
    throw new TypeError('Amount filters require a currency filter.');
  }

  for (const date of [options.purchasedFrom, options.purchasedTo]) {
    if (date !== undefined && !isValidLocalDate(date)) {
      throw new TypeError('Date filters must use real YYYY-MM-DD calendar dates.');
    }
  }

  if (
    options.purchasedFrom !== undefined &&
    options.purchasedTo !== undefined &&
    options.purchasedFrom > options.purchasedTo
  ) {
    throw new RangeError('Start date cannot be after end date.');
  }
}

function isValidLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
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
  assertValidReceipt(receipt);
  return receipt;
}

function normalizeMerchantName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
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

async function requireActiveReceipt(connection: SqliteConnection, id: string): Promise<Receipt> {
  const row = await connection.getFirst<ReceiptRow>(
    `${selectReceipt} WHERE r.id = ? AND r.deleted_at IS NULL;`,
    [id],
  );

  if (row === null) {
    throw new ReceiptNotFoundError();
  }

  return mapReceiptRow(row);
}

async function updateReceipt(
  connection: SqliteConnection,
  input: UpdateReceiptInput,
): Promise<Receipt> {
  const existing = await requireActiveReceipt(connection, input.id);
  assertExpectedVersion(existing, input.expectedVersion);
  const candidate: Receipt = {
    ...existing,
    currencyCode: input.currencyCode,
    discountMinor: input.discountMinor,
    merchantId: input.merchantId,
    merchantName: input.merchantName.trim(),
    notes: input.notes.trim(),
    purchasedAt: input.purchasedAt,
    subtotalMinor: input.subtotalMinor,
    taxMinor: input.taxMinor,
    tipMinor: input.tipMinor,
    totalMinor: input.totalMinor,
    updatedAt: input.updatedAt,
    version: existing.version + 1,
  };
  assertValidReceipt(candidate);
  const merchantId = await upsertMerchant(
    connection,
    candidate.merchantId,
    candidate.merchantName,
    candidate.updatedAt,
  );
  const storedReceipt = { ...candidate, merchantId };
  const result = await connection.run(
    `
      UPDATE receipts
      SET
        merchant_id = ?, purchased_at = ?, currency_code = ?, subtotal_minor = ?,
        tax_minor = ?, tip_minor = ?, discount_minor = ?, total_minor = ?, notes = ?,
        updated_at = ?, version = version + 1
      WHERE id = ? AND version = ? AND deleted_at IS NULL;
    `,
    [
      storedReceipt.merchantId,
      storedReceipt.purchasedAt,
      storedReceipt.currencyCode,
      storedReceipt.subtotalMinor,
      storedReceipt.taxMinor,
      storedReceipt.tipMinor,
      storedReceipt.discountMinor,
      storedReceipt.totalMinor,
      storedReceipt.notes,
      storedReceipt.updatedAt,
      storedReceipt.id,
      input.expectedVersion,
    ],
  );

  if (result.changes !== 1) {
    throw new ReceiptConflictError();
  }

  return storedReceipt;
}

async function upsertMerchant(
  connection: SqliteConnection,
  id: string,
  displayName: string,
  timestamp: string,
): Promise<string> {
  const normalizedName = normalizeMerchantName(displayName);
  const existing = await connection.getFirst<{ id: string }>(
    'SELECT id FROM merchants WHERE normalized_name = ?;',
    [normalizedName],
  );

  if (existing !== null) {
    await connection.run('UPDATE merchants SET display_name = ?, updated_at = ? WHERE id = ?;', [
      displayName.trim(),
      timestamp,
      existing.id,
    ]);
    return existing.id;
  }

  await connection.run(
    `
      INSERT INTO merchants (
        id, display_name, normalized_name, website, phone, created_at, updated_at
      ) VALUES (?, ?, ?, NULL, NULL, ?, ?);
    `,
    [id, displayName.trim(), normalizedName, timestamp, timestamp],
  );
  return id;
}

function validateReviewInput(input: ReviewReceiptInput): void {
  const evidenceIds = input.evidenceReviews.map(({ evidenceId }) => evidenceId);
  const reviewedFields = input.corrections.map(({ fieldName }) => fieldName);

  if (
    evidenceIds.some((id) => !isUuid(id)) ||
    new Set(evidenceIds).size !== evidenceIds.length ||
    new Set(input.processingHistoryIds).size !== input.processingHistoryIds.length ||
    input.processingHistoryIds.some((id) => !isUuid(id)) ||
    new Set(reviewedFields).size !== reviewedFields.length
  ) {
    throw new TypeError('Receipt review identifiers and fields must be unique and valid.');
  }

  for (const correction of input.corrections) {
    assertValidFieldEvidence(correction);

    if (
      correction.receiptId !== input.update.id ||
      correction.sourceType !== 'user_correction' ||
      correction.acceptedAt !== null ||
      correction.correctedAt !== input.update.updatedAt ||
      correction.processedAt !== input.update.updatedAt ||
      correction.boundingBox !== null ||
      correction.pageNumber !== null ||
      correction.confidence !== 1 ||
      !evidenceMatchesUpdate(correction.fieldName, correction.normalizedValue, input.update)
    ) {
      throw new TypeError('User correction evidence must match the reviewed receipt value.');
    }
  }

  if (input.evidenceReviews.some(({ reviewedAt }) => reviewedAt !== input.update.updatedAt)) {
    throw new TypeError('Receipt evidence must share the receipt review timestamp.');
  }
}

function validateCorrectionCoverage(
  input: ReviewReceiptInput,
  existing: Receipt,
  evidenceDecisions: ReadonlyMap<EvidenceFieldName, EvidenceReviewInput['status']>,
): void {
  const correctionFields = new Set(input.corrections.map(({ fieldName }) => fieldName));

  for (const fieldName of evidenceFieldNames) {
    const changed =
      receiptFieldValue(fieldName, existing) !== updateFieldValue(fieldName, input.update);
    const accepted = evidenceDecisions.get(fieldName) === 'accepted';
    const corrected = evidenceDecisions.get(fieldName) === 'corrected';
    const hasCorrection = correctionFields.has(fieldName);

    if (changed && !accepted && !hasCorrection) {
      throw new TypeError('Every changed receipt field requires accepted or corrected evidence.');
    }
    if (hasCorrection && !changed && !corrected) {
      throw new TypeError('Correction evidence requires a changed or rejected field value.');
    }
  }
}

function evidenceMatchesUpdate(
  fieldName: EvidenceFieldName,
  normalizedValue: string,
  input: UpdateReceiptInput,
): boolean {
  switch (fieldName) {
    case 'merchant_name':
      return normalizedValue.trim() === input.merchantName.trim();
    case 'purchased_at':
      return getPurchaseDate(normalizedValue) === getPurchaseDate(input.purchasedAt);
    case 'currency_code':
      return normalizedValue === input.currencyCode;
    case 'subtotal_minor':
      return normalizedValue === String(input.subtotalMinor);
    case 'tax_minor':
      return normalizedValue === String(input.taxMinor);
    case 'tip_minor':
      return normalizedValue === String(input.tipMinor);
    case 'discount_minor':
      return normalizedValue === String(input.discountMinor);
    case 'total_minor':
      return normalizedValue === String(input.totalMinor);
  }
}

function receiptFieldValue(fieldName: EvidenceFieldName, receipt: Receipt): string {
  switch (fieldName) {
    case 'merchant_name':
      return receipt.merchantName;
    case 'purchased_at':
      return getPurchaseDate(receipt.purchasedAt);
    case 'currency_code':
      return receipt.currencyCode;
    case 'subtotal_minor':
      return String(receipt.subtotalMinor);
    case 'tax_minor':
      return String(receipt.taxMinor);
    case 'tip_minor':
      return String(receipt.tipMinor);
    case 'discount_minor':
      return String(receipt.discountMinor);
    case 'total_minor':
      return String(receipt.totalMinor);
  }
}

function updateFieldValue(fieldName: EvidenceFieldName, input: UpdateReceiptInput): string {
  switch (fieldName) {
    case 'merchant_name':
      return input.merchantName.trim();
    case 'purchased_at':
      return getPurchaseDate(input.purchasedAt);
    case 'currency_code':
      return input.currencyCode;
    case 'subtotal_minor':
      return String(input.subtotalMinor);
    case 'tax_minor':
      return String(input.taxMinor);
    case 'tip_minor':
      return String(input.tipMinor);
    case 'discount_minor':
      return String(input.discountMinor);
    case 'total_minor':
      return String(input.totalMinor);
  }
}

function getProcessingReviewStatus(
  reviews: readonly EvidenceReviewInput[],
): 'accepted' | 'corrected' {
  return reviews.some(({ status }) => status === 'corrected') ? 'corrected' : 'accepted';
}
