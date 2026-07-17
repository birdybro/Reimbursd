// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptListOptions } from '@reimbursd/database';
import {
  localDateToOffsetDateTime,
  parseDecimalToMinorUnits,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

export interface ExpenseFilterValues {
  readonly categoryId: 'all' | string | null;
  readonly currencyCode: SupportedCurrencyCode | null;
  readonly maximumTotal: string;
  readonly minimumTotal: string;
  readonly purchasedFrom: string;
  readonly purchasedTo: string;
  readonly tagId: string | null;
}

export type ExpenseFilterField = keyof ExpenseFilterValues;
export type ExpenseFilterErrors = Partial<Record<ExpenseFilterField, string>>;

export type ExpenseFilterParseResult =
  | { readonly errors: ExpenseFilterErrors; readonly success: false }
  | { readonly options: ReceiptListOptions; readonly success: true };

export const emptyExpenseFilters: ExpenseFilterValues = {
  categoryId: 'all',
  currencyCode: null,
  maximumTotal: '',
  minimumTotal: '',
  purchasedFrom: '',
  purchasedTo: '',
  tagId: null,
};

export function parseExpenseFilters(values: ExpenseFilterValues): ExpenseFilterParseResult {
  const errors: ExpenseFilterErrors = {};
  const purchasedFrom = parseDate(values.purchasedFrom, 'purchasedFrom', errors);
  const purchasedTo = parseDate(values.purchasedTo, 'purchasedTo', errors);
  const minimumTotalMinor = parseAmount(values.minimumTotal, 'minimumTotal', values, errors);
  const maximumTotalMinor = parseAmount(values.maximumTotal, 'maximumTotal', values, errors);

  if (purchasedFrom !== undefined && purchasedTo !== undefined && purchasedFrom > purchasedTo) {
    errors.purchasedTo = 'End date cannot be before start date.';
  }

  if (
    minimumTotalMinor !== undefined &&
    maximumTotalMinor !== undefined &&
    minimumTotalMinor > maximumTotalMinor
  ) {
    errors.maximumTotal = 'Maximum amount cannot be below minimum amount.';
  }

  if (Object.keys(errors).length > 0) {
    return { errors, success: false };
  }

  return {
    options: {
      ...(values.categoryId === 'all' ? {} : { categoryId: values.categoryId }),
      ...(values.currencyCode === null ? {} : { currencyCode: values.currencyCode }),
      ...(maximumTotalMinor === undefined ? {} : { maximumTotalMinor }),
      ...(minimumTotalMinor === undefined ? {} : { minimumTotalMinor }),
      ...(purchasedFrom === undefined ? {} : { purchasedFrom }),
      ...(purchasedTo === undefined ? {} : { purchasedTo }),
      ...(values.tagId === null ? {} : { tagId: values.tagId }),
    },
    success: true,
  };
}

export function countActiveExpenseFilters(values: ExpenseFilterValues): number {
  return (
    (values.currencyCode === null ? 0 : 1) +
    (values.purchasedFrom.trim().length === 0 && values.purchasedTo.trim().length === 0 ? 0 : 1) +
    (values.minimumTotal.trim().length === 0 && values.maximumTotal.trim().length === 0 ? 0 : 1) +
    (values.categoryId === 'all' ? 0 : 1) +
    (values.tagId === null ? 0 : 1)
  );
}

function parseDate(
  value: string,
  field: 'purchasedFrom' | 'purchasedTo',
  errors: ExpenseFilterErrors,
): string | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  try {
    localDateToOffsetDateTime(normalized, 0);
    return normalized;
  } catch {
    errors[field] = 'Enter a real date in YYYY-MM-DD format.';
    return undefined;
  }
}

function parseAmount(
  value: string,
  field: 'maximumTotal' | 'minimumTotal',
  values: ExpenseFilterValues,
  errors: ExpenseFilterErrors,
): number | undefined {
  const normalized = value.trim();

  if (normalized.length === 0) {
    return undefined;
  }

  if (values.currencyCode === null) {
    errors.currencyCode = 'Select a currency before filtering by amount.';
    return undefined;
  }

  try {
    const amount = parseDecimalToMinorUnits(normalized, values.currencyCode);

    if (amount < 0) {
      errors[field] = 'Amount cannot be negative.';
      return undefined;
    }

    return amount;
  } catch (error) {
    errors[field] = error instanceof Error ? error.message : 'Enter a valid amount.';
    return undefined;
  }
}
