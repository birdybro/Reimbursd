// SPDX-License-Identifier: GPL-3.0-only
import { getPurchaseDate } from '@reimbursd/domain';

export function formatPurchaseDate(purchasedAt: string, locale?: string): string {
  const [year = 0, month = 0, day = 0] = getPurchaseDate(purchasedAt).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(date);
}
