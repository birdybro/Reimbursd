// SPDX-License-Identifier: GPL-3.0-only
import {
  formatMinorUnits,
  localDateToOffsetDateTime,
  parseDecimalToMinorUnits,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';
import type { CreateHostedReceiptInput } from './api-client.js';

export interface ReceiptDraft {
  readonly currencyCode: SupportedCurrencyCode;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchaseDate: string;
  readonly subtotal: string;
  readonly tax: string;
  readonly tip: string;
}

export class ReceiptDraftError extends Error {
  constructor() {
    super('Check the highlighted expense fields.');
    this.name = 'ReceiptDraftError';
  }
}

export function createHostedReceiptInput(
  draft: ReceiptDraft,
  dependencies: {
    readonly idFactory: () => string;
    readonly now: () => Date;
    readonly timezoneOffsetMinutes: number;
  },
): CreateHostedReceiptInput {
  const merchantName = draft.merchantName.trim();

  if (merchantName.length === 0 || merchantName.length > 200 || draft.notes.length > 2_000) {
    throw new ReceiptDraftError();
  }

  try {
    const subtotalMinor = parseNonnegative(draft.subtotal, draft.currencyCode);
    const taxMinor = parseNonnegative(draft.tax, draft.currencyCode);
    const tipMinor = parseNonnegative(draft.tip, draft.currencyCode);
    const totalMinor = subtotalMinor + taxMinor + tipMinor;

    if (!Number.isSafeInteger(totalMinor)) {
      throw new ReceiptDraftError();
    }

    return {
      capturedAt: dependencies.now().toISOString(),
      currencyCode: draft.currencyCode,
      discountMinor: 0,
      id: dependencies.idFactory(),
      merchantId: dependencies.idFactory(),
      merchantName,
      notes: draft.notes.trim(),
      purchasedAt: localDateToOffsetDateTime(
        draft.purchaseDate,
        dependencies.timezoneOffsetMinutes,
      ),
      subtotalMinor,
      taxMinor,
      tipMinor,
      totalMinor,
    };
  } catch (error) {
    if (error instanceof ReceiptDraftError) {
      throw error;
    }

    throw new ReceiptDraftError();
  }
}

export function formatDraftTotal(draft: ReceiptDraft): string {
  try {
    const total =
      parseNonnegative(draft.subtotal, draft.currencyCode) +
      parseNonnegative(draft.tax, draft.currencyCode) +
      parseNonnegative(draft.tip, draft.currencyCode);
    return Number.isSafeInteger(total) ? formatMinorUnits(total, draft.currencyCode) : '—';
  } catch {
    return '—';
  }
}

function parseNonnegative(value: string, currencyCode: SupportedCurrencyCode): number {
  const parsed = parseDecimalToMinorUnits(value.trim() || '0', currencyCode);

  if (parsed < 0) {
    throw new ReceiptDraftError();
  }

  return parsed;
}
