// SPDX-License-Identifier: GPL-3.0-only
import { isSupportedCurrencyCode, type SupportedCurrencyCode } from './money.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const localDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface Receipt {
  readonly capturedAt: string;
  readonly categoryId: string | null;
  readonly createdAt: string;
  readonly currencyCode: SupportedCurrencyCode;
  readonly deletedAt: string | null;
  readonly discountMinor: number;
  readonly id: string;
  readonly locationId: string | null;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchasedAt: string;
  readonly sourceType: 'manual';
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly tipMinor: number;
  readonly totalMinor: number;
  readonly updatedAt: string;
  readonly version: number;
}

export interface CreateManualReceiptInput {
  readonly capturedAt: string;
  readonly currencyCode: SupportedCurrencyCode;
  readonly discountMinor?: number;
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly notes?: string;
  readonly purchasedAt: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly tipMinor: number;
  readonly totalMinor: number;
}

export interface ReceiptValidationIssue {
  readonly field: keyof Receipt | 'purchaseDate';
  readonly message: string;
}

export class ReceiptValidationError extends Error {
  readonly issues: readonly ReceiptValidationIssue[];

  constructor(issues: readonly ReceiptValidationIssue[]) {
    super('Receipt data is invalid.');
    this.name = 'ReceiptValidationError';
    this.issues = issues;
  }
}

export function isUuid(value: string): boolean {
  return uuidPattern.test(value);
}

export function localDateToOffsetDateTime(
  localDate: string,
  timezoneOffsetMinutes: number,
): string {
  const match = localDatePattern.exec(localDate);

  if (!match) {
    throw new ReceiptValidationError([
      { field: 'purchaseDate', message: 'Enter a purchase date in YYYY-MM-DD format.' },
    ]);
  }

  const [, yearText = '', monthText = '', dayText = ''] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    throw new ReceiptValidationError([
      { field: 'purchaseDate', message: 'Enter a real calendar date.' },
    ]);
  }

  if (!Number.isInteger(timezoneOffsetMinutes) || Math.abs(timezoneOffsetMinutes) > 14 * 60) {
    throw new RangeError('Timezone offset must be a whole number of minutes within 14 hours.');
  }

  const offsetSign = timezoneOffsetMinutes <= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(timezoneOffsetMinutes);
  const offsetHours = Math.floor(absoluteOffset / 60)
    .toString()
    .padStart(2, '0');
  const offsetMinutes = (absoluteOffset % 60).toString().padStart(2, '0');

  return `${localDate}T12:00:00${offsetSign}${offsetHours}:${offsetMinutes}`;
}

export function getPurchaseDate(purchasedAt: string): string {
  return purchasedAt.slice(0, 10);
}

export function createManualReceipt(input: CreateManualReceiptInput): Receipt {
  const timestamp = input.capturedAt;
  const receipt: Receipt = {
    capturedAt: timestamp,
    categoryId: null,
    createdAt: timestamp,
    currencyCode: input.currencyCode,
    deletedAt: null,
    discountMinor: input.discountMinor ?? 0,
    id: input.id,
    locationId: null,
    merchantId: input.merchantId,
    merchantName: input.merchantName.trim(),
    notes: input.notes?.trim() ?? '',
    purchasedAt: input.purchasedAt,
    sourceType: 'manual',
    subtotalMinor: input.subtotalMinor,
    taxMinor: input.taxMinor,
    tipMinor: input.tipMinor,
    totalMinor: input.totalMinor,
    updatedAt: timestamp,
    version: 1,
  };

  const issues = validateReceipt(receipt);

  if (issues.length > 0) {
    throw new ReceiptValidationError(issues);
  }

  return receipt;
}

export function validateReceipt(receipt: Receipt): readonly ReceiptValidationIssue[] {
  const issues: ReceiptValidationIssue[] = [];

  if (!isUuid(receipt.id)) {
    issues.push({ field: 'id', message: 'Receipt ID must be a UUID.' });
  }

  if (!isUuid(receipt.merchantId)) {
    issues.push({ field: 'merchantId', message: 'Merchant ID must be a UUID.' });
  }

  if (receipt.categoryId !== null && !isUuid(receipt.categoryId)) {
    issues.push({ field: 'categoryId', message: 'Category ID must be a UUID when present.' });
  }

  if (receipt.locationId !== null && !isUuid(receipt.locationId)) {
    issues.push({ field: 'locationId', message: 'Location ID must be a UUID when present.' });
  }

  if (receipt.merchantName.length === 0 || receipt.merchantName.length > 200) {
    issues.push({
      field: 'merchantName',
      message: 'Merchant name must contain between 1 and 200 characters.',
    });
  }

  if (!isSupportedCurrencyCode(receipt.currencyCode)) {
    issues.push({ field: 'currencyCode', message: 'Currency code is not supported.' });
  }

  validateDateTime(receipt.purchasedAt, 'purchasedAt', issues);
  validateDateTime(receipt.capturedAt, 'capturedAt', issues);
  validateDateTime(receipt.createdAt, 'createdAt', issues);
  validateDateTime(receipt.updatedAt, 'updatedAt', issues);

  const amountFields = [
    'subtotalMinor',
    'taxMinor',
    'tipMinor',
    'discountMinor',
    'totalMinor',
  ] as const;

  for (const field of amountFields) {
    if (!Number.isSafeInteger(receipt[field]) || receipt[field] < 0) {
      issues.push({ field, message: 'Amount must be a nonnegative safe integer in minor units.' });
    }
  }

  if (
    amountFields.every((field) => Number.isSafeInteger(receipt[field])) &&
    receipt.subtotalMinor + receipt.taxMinor + receipt.tipMinor - receipt.discountMinor !==
      receipt.totalMinor
  ) {
    issues.push({
      field: 'totalMinor',
      message: 'Total must equal subtotal plus tax and tip, less discount.',
    });
  }

  if (receipt.notes.length > 2_000) {
    issues.push({ field: 'notes', message: 'Notes cannot exceed 2,000 characters.' });
  }

  if (!Number.isSafeInteger(receipt.version) || receipt.version < 1) {
    issues.push({ field: 'version', message: 'Version must be a positive safe integer.' });
  }

  if (receipt.deletedAt !== null) {
    validateDateTime(receipt.deletedAt, 'deletedAt', issues);
  }

  return issues;
}

function validateDateTime(
  value: string,
  field: 'capturedAt' | 'createdAt' | 'deletedAt' | 'purchasedAt' | 'updatedAt',
  issues: ReceiptValidationIssue[],
): void {
  if (!offsetDateTimePattern.test(value) || Number.isNaN(Date.parse(value))) {
    issues.push({ field, message: 'Timestamp must be valid ISO 8601 with a timezone offset.' });
  }
}
