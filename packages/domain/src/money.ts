// SPDX-License-Identifier: GPL-3.0-only
const currencyFractionDigits = {
  AUD: 2,
  CAD: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  USD: 2,
} as const;

export type SupportedCurrencyCode = keyof typeof currencyFractionDigits;

export function isSupportedCurrencyCode(value: string): value is SupportedCurrencyCode {
  return Object.hasOwn(currencyFractionDigits, value);
}

export function getCurrencyFractionDigits(currencyCode: SupportedCurrencyCode): number {
  return currencyFractionDigits[currencyCode];
}

export function parseDecimalToMinorUnits(
  input: string,
  currencyCode: SupportedCurrencyCode,
): number {
  const normalized = input.trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(normalized);

  if (!match) {
    throw new TypeError('Enter an amount using digits and an optional decimal point.');
  }

  const [, sign = '', whole = '', fraction = ''] = match;
  const fractionDigits = getCurrencyFractionDigits(currencyCode);

  if (fraction.length > fractionDigits) {
    throw new RangeError(
      `${currencyCode} amounts support at most ${fractionDigits} decimal places.`,
    );
  }

  const scale = 10n ** BigInt(fractionDigits);
  const paddedFraction = fraction.padEnd(fractionDigits, '0');
  const absoluteMinorUnits = BigInt(whole) * scale + BigInt(paddedFraction || '0');
  const signedMinorUnits = sign === '-' ? -absoluteMinorUnits : absoluteMinorUnits;
  const result = Number(signedMinorUnits);

  if (!Number.isSafeInteger(result)) {
    throw new RangeError('Amount is outside the supported range.');
  }

  return result;
}

export function formatMinorUnits(
  minorUnits: number,
  currencyCode: SupportedCurrencyCode,
  locale = 'en-US',
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new TypeError('Minor units must be a safe integer.');
  }

  const fractionDigits = getCurrencyFractionDigits(currencyCode);
  const scale = 10 ** fractionDigits;

  return new Intl.NumberFormat(locale, {
    currency: currencyCode,
    currencyDisplay: 'symbol',
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: 'currency',
  }).format(minorUnits / scale);
}

export function minorUnitsToDecimal(
  minorUnits: number,
  currencyCode: SupportedCurrencyCode,
): string {
  if (!Number.isSafeInteger(minorUnits)) {
    throw new TypeError('Minor units must be a safe integer.');
  }

  const fractionDigits = getCurrencyFractionDigits(currencyCode);

  if (fractionDigits === 0) {
    return minorUnits.toString();
  }

  const sign = minorUnits < 0 ? '-' : '';
  const absoluteMinorUnits = Math.abs(minorUnits);
  const scale = 10 ** fractionDigits;
  const whole = Math.floor(absoluteMinorUnits / scale);
  const fraction = (absoluteMinorUnits % scale).toString().padStart(fractionDigits, '0');
  return `${sign}${whole}.${fraction}`;
}
