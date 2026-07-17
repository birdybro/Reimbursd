// SPDX-License-Identifier: GPL-3.0-only
import type { ReviewReceiptInput, UpdateReceiptInput } from '@reimbursd/database';
import {
  evidenceFieldNames,
  getPurchaseDate,
  isSupportedCurrencyCode,
  minorUnitsToDecimal,
  type EvidenceFieldName,
  type FieldEvidence,
  type Receipt,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

import { receiptToExpenseForm, type ExpenseFormValues } from './expense-form';

const userReviewProcessorName = 'reimbursd-user-review';
const userReviewProcessorVersion = '1.0.0';

interface BuildReceiptReviewInputOptions {
  readonly idFactory: () => string;
  readonly processingHistoryIds: readonly string[];
  readonly receipt: Receipt;
  readonly suggestions: readonly FieldEvidence[];
  readonly update: UpdateReceiptInput;
}

export function receiptToReviewExpenseForm(
  receipt: Receipt,
  suggestions: readonly FieldEvidence[],
): ExpenseFormValues {
  const values = receiptToExpenseForm(receipt);
  const byField = new Map(suggestions.map((evidence) => [evidence.fieldName, evidence]));
  const suggestedCurrency = byField.get('currency_code')?.normalizedValue;
  const currencyCode: SupportedCurrencyCode =
    suggestedCurrency !== undefined && isSupportedCurrencyCode(suggestedCurrency)
      ? suggestedCurrency
      : receipt.currencyCode;

  return {
    ...values,
    currencyCode,
    discount: getSuggestedAmount(byField.get('discount_minor'), currencyCode, values.discount),
    merchantName: byField.get('merchant_name')?.normalizedValue ?? values.merchantName,
    purchaseDate: getSuggestedDate(byField.get('purchased_at'), values.purchaseDate),
    subtotal: getSuggestedAmount(byField.get('subtotal_minor'), currencyCode, values.subtotal),
    tax: getSuggestedAmount(byField.get('tax_minor'), currencyCode, values.tax),
    tip: getSuggestedAmount(byField.get('tip_minor'), currencyCode, values.tip),
    total: getSuggestedAmount(byField.get('total_minor'), currencyCode, values.total),
  };
}

export function buildReceiptReviewInput({
  idFactory,
  processingHistoryIds,
  receipt,
  suggestions,
  update,
}: BuildReceiptReviewInputOptions): ReviewReceiptInput {
  const suggestionByField = new Map(suggestions.map((evidence) => [evidence.fieldName, evidence]));
  const evidenceReviews = suggestions.map((evidence) => ({
    evidenceId: evidence.id,
    reviewedAt: update.updatedAt,
    status: evidenceMatchesUpdate(evidence, update)
      ? ('accepted' as const)
      : ('corrected' as const),
  }));
  const corrections = evidenceFieldNames.flatMap((fieldName) => {
    const suggestion = suggestionByField.get(fieldName);
    const needsCorrection =
      (suggestion !== undefined && !evidenceMatchesUpdate(suggestion, update)) ||
      (suggestion === undefined && receiptFieldChanged(fieldName, receipt, update));

    if (!needsCorrection) {
      return [];
    }

    const normalizedValue = getUpdateFieldValue(fieldName, update);
    const correction: FieldEvidence = {
      acceptedAt: null,
      boundingBox: null,
      confidence: 1,
      correctedAt: update.updatedAt,
      extractedValue: normalizedValue,
      fieldName,
      id: idFactory(),
      normalizedValue,
      pageNumber: null,
      processedAt: update.updatedAt,
      processorName: userReviewProcessorName,
      processorVersion: userReviewProcessorVersion,
      receiptId: receipt.id,
      sourceType: 'user_correction',
    };
    return [correction];
  });

  return {
    corrections,
    evidenceReviews,
    processingHistoryIds: evidenceReviews.length === 0 ? [] : [...processingHistoryIds],
    update,
  };
}

function getSuggestedAmount(
  evidence: FieldEvidence | undefined,
  currencyCode: SupportedCurrencyCode,
  fallback: string,
): string {
  if (evidence === undefined || !/^\d+$/.test(evidence.normalizedValue)) {
    return fallback;
  }

  const minorUnits = Number(evidence.normalizedValue);
  return Number.isSafeInteger(minorUnits)
    ? minorUnitsToDecimal(minorUnits, currencyCode)
    : fallback;
}

function getSuggestedDate(evidence: FieldEvidence | undefined, fallback: string): string {
  if (evidence === undefined || Number.isNaN(Date.parse(evidence.normalizedValue))) {
    return fallback;
  }

  return getPurchaseDate(evidence.normalizedValue);
}

function evidenceMatchesUpdate(evidence: FieldEvidence, update: UpdateReceiptInput): boolean {
  if (evidence.fieldName === 'purchased_at') {
    return getPurchaseDate(evidence.normalizedValue) === getPurchaseDate(update.purchasedAt);
  }

  return evidence.normalizedValue === getUpdateFieldValue(evidence.fieldName, update);
}

function receiptFieldChanged(
  fieldName: EvidenceFieldName,
  receipt: Receipt,
  update: UpdateReceiptInput,
): boolean {
  if (fieldName === 'purchased_at') {
    return getPurchaseDate(receipt.purchasedAt) !== getPurchaseDate(update.purchasedAt);
  }

  return getReceiptFieldValue(fieldName, receipt) !== getUpdateFieldValue(fieldName, update);
}

function getReceiptFieldValue(fieldName: EvidenceFieldName, receipt: Receipt): string {
  switch (fieldName) {
    case 'merchant_name':
      return receipt.merchantName;
    case 'purchased_at':
      return receipt.purchasedAt;
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

function getUpdateFieldValue(fieldName: EvidenceFieldName, update: UpdateReceiptInput): string {
  switch (fieldName) {
    case 'merchant_name':
      return update.merchantName;
    case 'purchased_at':
      return update.purchasedAt;
    case 'currency_code':
      return update.currencyCode;
    case 'subtotal_minor':
      return String(update.subtotalMinor);
    case 'tax_minor':
      return String(update.taxMinor);
    case 'tip_minor':
      return String(update.tipMinor);
    case 'discount_minor':
      return String(update.discountMinor);
    case 'total_minor':
      return String(update.totalMinor);
  }
}
