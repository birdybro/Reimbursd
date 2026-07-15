// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';

import {
  formatMinorUnits,
  getCurrencyFractionDigits,
  isSupportedCurrencyCode,
  minorUnitsToDecimal,
  parseDecimalToMinorUnits,
} from './money.js';

describe('money', () => {
  it('parses decimal strings without floating-point arithmetic', () => {
    expect(parseDecimalToMinorUnits('12.34', 'USD')).toBe(1234);
    expect(parseDecimalToMinorUnits('12.3', 'USD')).toBe(1230);
    expect(parseDecimalToMinorUnits('-0.05', 'USD')).toBe(-5);
  });

  it('uses each currency minor-unit precision', () => {
    expect(getCurrencyFractionDigits('JPY')).toBe(0);
    expect(parseDecimalToMinorUnits('450', 'JPY')).toBe(450);
    expect(() => parseDecimalToMinorUnits('450.5', 'JPY')).toThrow(RangeError);
  });

  it('rejects ambiguous, over-precise, and unsafe values', () => {
    expect(() => parseDecimalToMinorUnits('1,000.00', 'USD')).toThrow(TypeError);
    expect(() => parseDecimalToMinorUnits('1.001', 'USD')).toThrow(RangeError);
    expect(() => parseDecimalToMinorUnits('99999999999999999999.00', 'USD')).toThrow(RangeError);
  });

  it('formats only integer minor units', () => {
    expect(formatMinorUnits(1234, 'USD', 'en-US')).toBe('$12.34');
    expect(formatMinorUnits(450, 'JPY', 'ja-JP')).toBe('￥450');
    expect(() => formatMinorUnits(12.5, 'USD')).toThrow(TypeError);
  });

  it('formats editable decimal values without currency symbols', () => {
    expect(minorUnitsToDecimal(1_234, 'USD')).toBe('12.34');
    expect(minorUnitsToDecimal(450, 'JPY')).toBe('450');
    expect(minorUnitsToDecimal(-5, 'EUR')).toBe('-0.05');
  });

  it('recognizes the intentionally supported ISO 4217 codes', () => {
    expect(isSupportedCurrencyCode('EUR')).toBe(true);
    expect(isSupportedCurrencyCode('usd')).toBe(false);
    expect(isSupportedCurrencyCode('ZZZ')).toBe(false);
  });
});
