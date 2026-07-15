// SPDX-License-Identifier: GPL-3.0-only
import type { UpdateReceiptInput } from '@reimbursd/database';
import {
  createManualReceipt,
  getPurchaseDate,
  localDateToOffsetDateTime,
  minorUnitsToDecimal,
  parseDecimalToMinorUnits,
  validateReceipt,
  type Receipt,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

export interface ExpenseFormValues {
  readonly currencyCode: SupportedCurrencyCode;
  readonly discount: string;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchaseDate: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly tip: string;
  readonly total: string;
}

export type ExpenseFormField = keyof ExpenseFormValues;
export type ExpenseFormErrors = Partial<Record<ExpenseFormField, string>>;

export type ExpenseFormSubmission =
  | { readonly kind: 'create'; readonly receipt: Receipt }
  | { readonly input: UpdateReceiptInput; readonly kind: 'update' };

export type ExpenseFormParseResult =
  | { readonly errors: ExpenseFormErrors; readonly success: false }
  | { readonly submission: ExpenseFormSubmission; readonly success: true };

interface ParseExpenseFormOptions {
  readonly idFactory: () => string;
  readonly now: Date;
  readonly receipt?: Receipt;
  readonly timezoneOffsetMinutes: number;
}

export function createEmptyExpenseForm(now: Date): ExpenseFormValues {
  return {
    currencyCode: 'USD',
    discount: '0.00',
    merchantName: '',
    notes: '',
    purchaseDate: formatLocalDate(now),
    subtotal: '',
    tax: '0.00',
    tip: '0.00',
    total: '',
  };
}

export function receiptToExpenseForm(receipt: Receipt): ExpenseFormValues {
  return {
    currencyCode: receipt.currencyCode,
    discount: minorUnitsToDecimal(receipt.discountMinor, receipt.currencyCode),
    merchantName: receipt.merchantName,
    notes: receipt.notes,
    purchaseDate: getPurchaseDate(receipt.purchasedAt),
    subtotal: minorUnitsToDecimal(receipt.subtotalMinor, receipt.currencyCode),
    tax: minorUnitsToDecimal(receipt.taxMinor, receipt.currencyCode),
    tip: minorUnitsToDecimal(receipt.tipMinor, receipt.currencyCode),
    total: minorUnitsToDecimal(receipt.totalMinor, receipt.currencyCode),
  };
}

export function parseExpenseForm(
  values: ExpenseFormValues,
  options: ParseExpenseFormOptions,
): ExpenseFormParseResult {
  const errors: ExpenseFormErrors = {};
  const merchantName = values.merchantName.trim();

  if (merchantName.length === 0) {
    errors.merchantName = 'Enter a merchant name.';
  }

  let purchasedAt: string | undefined;
  try {
    purchasedAt = localDateToOffsetDateTime(values.purchaseDate, options.timezoneOffsetMinutes);
  } catch (error) {
    errors.purchaseDate = getErrorMessage(error);
  }

  const subtotalMinor = parseAmount(values.subtotal, values.currencyCode, 'subtotal', errors);
  const taxMinor = parseAmount(values.tax || '0', values.currencyCode, 'tax', errors);
  const tipMinor = parseAmount(values.tip || '0', values.currencyCode, 'tip', errors);
  const discountMinor = parseAmount(
    values.discount || '0',
    values.currencyCode,
    'discount',
    errors,
  );
  const totalMinor = parseAmount(values.total, values.currencyCode, 'total', errors);

  if (
    Object.keys(errors).length > 0 ||
    purchasedAt === undefined ||
    subtotalMinor === undefined ||
    taxMinor === undefined ||
    tipMinor === undefined ||
    discountMinor === undefined ||
    totalMinor === undefined
  ) {
    return { errors, success: false };
  }

  const timestamp = options.now.toISOString();

  if (options.receipt === undefined) {
    try {
      return {
        submission: {
          kind: 'create',
          receipt: createManualReceipt({
            capturedAt: timestamp,
            currencyCode: values.currencyCode,
            discountMinor,
            id: options.idFactory(),
            merchantId: options.idFactory(),
            merchantName,
            notes: values.notes,
            purchasedAt,
            subtotalMinor,
            taxMinor,
            tipMinor,
            totalMinor,
          }),
        },
        success: true,
      };
    } catch (error) {
      return { errors: mapDomainError(error), success: false };
    }
  }

  const candidate: Receipt = {
    ...options.receipt,
    currencyCode: values.currencyCode,
    discountMinor,
    merchantId: options.idFactory(),
    merchantName,
    notes: values.notes.trim(),
    purchasedAt,
    subtotalMinor,
    taxMinor,
    tipMinor,
    totalMinor,
    updatedAt: timestamp,
    version: options.receipt.version + 1,
  };
  const issues = validateReceipt(candidate);

  if (issues.length > 0) {
    return { errors: mapIssues(issues), success: false };
  }

  return {
    submission: {
      input: {
        currencyCode: candidate.currencyCode,
        discountMinor: candidate.discountMinor,
        expectedVersion: options.receipt.version,
        id: candidate.id,
        merchantId: candidate.merchantId,
        merchantName: candidate.merchantName,
        notes: candidate.notes,
        purchasedAt: candidate.purchasedAt,
        subtotalMinor: candidate.subtotalMinor,
        taxMinor: candidate.taxMinor,
        tipMinor: candidate.tipMinor,
        totalMinor: candidate.totalMinor,
        updatedAt: candidate.updatedAt,
      },
      kind: 'update',
    },
    success: true,
  };
}

function formatLocalDate(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
    const firstIssue = error.issues.find(isIssue);
    if (firstIssue !== undefined) {
      return firstIssue.message;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Enter a valid value.';
}

function mapDomainError(error: unknown): ExpenseFormErrors {
  if (error instanceof Error && 'issues' in error && Array.isArray(error.issues)) {
    return mapIssues(error.issues.filter(isIssue));
  }

  return { total: getErrorMessage(error) };
}

function isIssue(value: unknown): value is { field: string; message: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  return (
    'field' in value &&
    typeof value.field === 'string' &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

function mapIssues(
  issues: readonly { readonly field: string; readonly message: string }[],
): ExpenseFormErrors {
  const errors: ExpenseFormErrors = {};
  const fieldMap: Readonly<Record<string, ExpenseFormField>> = {
    currencyCode: 'currencyCode',
    discountMinor: 'discount',
    merchantName: 'merchantName',
    notes: 'notes',
    purchaseDate: 'purchaseDate',
    purchasedAt: 'purchaseDate',
    subtotalMinor: 'subtotal',
    taxMinor: 'tax',
    tipMinor: 'tip',
    totalMinor: 'total',
  };

  for (const issue of issues) {
    const formField = fieldMap[issue.field];
    if (formField !== undefined && errors[formField] === undefined) {
      errors[formField] = issue.message;
    }
  }

  return errors;
}

function parseAmount(
  value: string,
  currencyCode: SupportedCurrencyCode,
  field: 'discount' | 'subtotal' | 'tax' | 'tip' | 'total',
  errors: ExpenseFormErrors,
): number | undefined {
  try {
    return parseDecimalToMinorUnits(value, currencyCode);
  } catch (error) {
    errors[field] = getErrorMessage(error);
    return undefined;
  }
}
