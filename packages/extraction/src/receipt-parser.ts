// SPDX-License-Identifier: GPL-3.0-only
import {
  evidenceFieldNames,
  getCurrencyFractionDigits,
  isSupportedCurrencyCode,
  localDateToOffsetDateTime,
  parseDecimalToMinorUnits,
  type EvidenceFieldName,
  type NormalizedBoundingBox,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';
import {
  defaultOcrLimits,
  OcrOutputValidationError,
  validateOcrOutput,
  type OcrOutput,
} from '@reimbursd/ocr';

const safeCodePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const unsafeTextPattern = /[\u0000\u000b\u000c\u000e-\u001f\u007f]/;
const amountPattern =
  /(?:(USD|CAD|AUD|EUR|GBP|JPY)\s*)?([$€£¥])?\s*((?:\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,]\d{1,2})?)\s*(USD|CAD|AUD|EUR|GBP|JPY)?\s*$/i;
const subtotalPattern = /\bsub[\s-]*total\b/i;
const taxPattern = /\b(?:sales\s+tax|tax|vat|gst|hst)\b/i;
const tipPattern = /\b(?:tip|gratuity)\b/i;
const totalPattern = /\b(?:grand\s+total|amount\s+due|balance\s+due|total)\b/i;
const instructionLikePattern = /\b(?:ignore\s+previous|instructions?|prompt|system|assistant)\b/i;
const nonMerchantPattern =
  /^(?:date|time|cashier|store\s*#|tel|telephone|phone|www\.|https?:\/\/)/i;
const dateOrderValues = ['mdy', 'dmy'] as const;
const maximumCandidateTextLength = 4_096;
const maximumParserLineLength = 512;

export type DateOrder = (typeof dateOrderValues)[number];

export interface ReceiptParserContext {
  readonly dateOrder: DateOrder;
  readonly defaultCurrencyCode: SupportedCurrencyCode;
  readonly timezoneOffsetMinutes: number;
}

export interface ReceiptFieldCandidate {
  readonly boundingBox: NormalizedBoundingBox | null;
  readonly confidence: number;
  readonly extractedValue: string;
  readonly fieldName: EvidenceFieldName;
  readonly normalizedValue: string;
  readonly pageNumber: number;
}

export interface ReceiptParser {
  readonly name: string;
  readonly version: string;
  parse(output: OcrOutput, context: ReceiptParserContext): unknown;
}

export class ReceiptParserContextValidationError extends Error {
  constructor() {
    super('Receipt parser context is invalid.');
    this.name = 'ReceiptParserContextValidationError';
  }
}

export class ReceiptParserOutputValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('Receipt parser output is invalid.');
    this.name = 'ReceiptParserOutputValidationError';
    this.issues = issues;
  }
}

export function runReceiptParser(
  parser: ReceiptParser,
  output: OcrOutput,
  context: ReceiptParserContext,
): readonly ReceiptFieldCandidate[] {
  assertSafeParserMetadata(parser);
  assertValidContext(context);
  const ocrIssues = validateOcrOutput(output, defaultOcrLimits.maximumPageCount, defaultOcrLimits);

  if (ocrIssues.length > 0) {
    throw new OcrOutputValidationError(ocrIssues);
  }

  const parsed = parser.parse(output, context);
  const issues = validateReceiptParserOutput(parsed, output);

  if (issues.length > 0) {
    throw new ReceiptParserOutputValidationError(issues);
  }

  return cloneCandidates(parsed as readonly ReceiptFieldCandidate[]);
}

export function validateReceiptParserOutput(value: unknown, output: OcrOutput): readonly string[] {
  if (!Array.isArray(value)) {
    return ['Receipt parser output must be an array.'];
  }

  const issues: string[] = [];
  const pageNumbers = new Set(output.pages.map(({ pageNumber }) => pageNumber));
  const fieldNames = new Set<EvidenceFieldName>();

  if (value.length > evidenceFieldNames.length) {
    issues.push('Receipt parser output contains too many candidates.');
  }

  for (const candidate of value.slice(0, evidenceFieldNames.length + 1)) {
    if (!isRecord(candidate)) {
      issues.push('Each receipt candidate must be an object.');
      continue;
    }

    if (
      typeof candidate.fieldName !== 'string' ||
      !evidenceFieldNames.some((fieldName) => fieldName === candidate.fieldName) ||
      fieldNames.has(candidate.fieldName as EvidenceFieldName)
    ) {
      issues.push('Receipt candidate field names must be unique and supported.');
    } else {
      fieldNames.add(candidate.fieldName as EvidenceFieldName);
    }

    if (!isBoundedCandidateText(candidate.extractedValue)) {
      issues.push('Receipt candidate extracted values must be bounded text.');
    }

    if (!isBoundedCandidateText(candidate.normalizedValue)) {
      issues.push('Receipt candidate normalized values must be bounded text.');
    }

    if (
      typeof candidate.confidence !== 'number' ||
      !Number.isFinite(candidate.confidence) ||
      candidate.confidence < 0 ||
      candidate.confidence > 1
    ) {
      issues.push('Receipt candidate confidence must be between 0 and 1.');
    }

    if (
      typeof candidate.pageNumber !== 'number' ||
      !Number.isSafeInteger(candidate.pageNumber) ||
      !pageNumbers.has(candidate.pageNumber)
    ) {
      issues.push('Receipt candidates must identify an OCR output page.');
    }

    if (candidate.boundingBox !== null && !isNormalizedBoundingBox(candidate.boundingBox)) {
      issues.push('Receipt candidate bounding boxes must be normalized page rectangles.');
    }
  }

  return issues;
}

export class DeterministicReceiptParser implements ReceiptParser {
  readonly name = 'reimbursd-deterministic-parser';
  readonly version = '1.0.0';

  parse(output: OcrOutput, context: ReceiptParserContext): readonly ReceiptFieldCandidate[] {
    const lines = collectSourceLines(output);
    const candidates = new Map<EvidenceFieldName, ReceiptFieldCandidate>();
    const amountMatches: AmountMatch[] = [];

    const merchant = parseMerchant(lines);
    if (merchant !== null) {
      candidates.set(merchant.fieldName, merchant);
    }

    const purchaseDate = parsePurchaseDate(lines, context);
    if (purchaseDate !== null) {
      candidates.set(purchaseDate.fieldName, purchaseDate);
    }

    for (const line of lines) {
      const fieldName = classifyAmountField(line.text);

      if (fieldName === null) {
        continue;
      }

      const amount = parseAmount(line, context.defaultCurrencyCode);

      if (amount === null) {
        continue;
      }

      amountMatches.push({ ...amount, fieldName, line });
      candidates.set(fieldName, {
        boundingBox: line.boundingBox,
        confidence: combineConfidence(line.confidence, amountFieldCertainty(fieldName)),
        extractedValue: amount.extractedValue,
        fieldName,
        normalizedValue: amount.minorUnits.toString(),
        pageNumber: line.pageNumber,
      });
    }

    const currency = parseCurrency(lines, amountMatches, context.defaultCurrencyCode);
    if (currency !== null) {
      candidates.set(currency.fieldName, currency);
    }

    return evidenceFieldNames.flatMap((fieldName) => {
      const candidate = candidates.get(fieldName);
      return candidate === undefined ? [] : [candidate];
    });
  }
}

interface SourceLine {
  readonly boundingBox: NormalizedBoundingBox | null;
  readonly confidence: number;
  readonly pageNumber: number;
  readonly position: number;
  readonly text: string;
}

interface ParsedAmount {
  readonly currencyCode: SupportedCurrencyCode;
  readonly currencyToken: string | null;
  readonly currencyTokenCertainty: number;
  readonly extractedValue: string;
  readonly minorUnits: number;
}

interface AmountMatch extends ParsedAmount {
  readonly fieldName: AmountFieldName;
  readonly line: SourceLine;
}

type AmountFieldName = Extract<
  EvidenceFieldName,
  'subtotal_minor' | 'tax_minor' | 'tip_minor' | 'total_minor'
>;

function collectSourceLines(output: OcrOutput): readonly SourceLine[] {
  const lines: SourceLine[] = [];
  const pages = [...output.pages].sort((first, second) => first.pageNumber - second.pageNumber);

  for (const page of pages) {
    for (const block of page.blocks) {
      for (const text of block.text.split(/\r?\n/)) {
        const trimmed = text.trim();

        if (trimmed.length === 0 || trimmed.length > maximumParserLineLength) {
          continue;
        }

        lines.push({
          boundingBox: block.boundingBox === null ? null : { ...block.boundingBox },
          confidence: block.confidence,
          pageNumber: page.pageNumber,
          position: lines.length,
          text: trimmed,
        });

        if (lines.length >= defaultOcrLimits.maximumBlockCount) {
          return lines;
        }
      }
    }
  }

  return lines;
}

function parseMerchant(lines: readonly SourceLine[]): ReceiptFieldCandidate | null {
  const line = lines
    .filter(({ pageNumber }) => pageNumber === 1)
    .slice(0, 12)
    .find(({ text }) => isPlausibleMerchant(text));

  if (line === undefined) {
    return null;
  }

  return {
    boundingBox: line.boundingBox,
    confidence: combineConfidence(line.confidence, 0.75),
    extractedValue: line.text,
    fieldName: 'merchant_name',
    normalizedValue: line.text.replace(/\s+/g, ' ').trim(),
    pageNumber: line.pageNumber,
  };
}

function isPlausibleMerchant(text: string): boolean {
  return (
    text.length <= 200 &&
    !subtotalPattern.test(text) &&
    !taxPattern.test(text) &&
    !tipPattern.test(text) &&
    !totalPattern.test(text) &&
    !nonMerchantPattern.test(text) &&
    !instructionLikePattern.test(text) &&
    !text.includes('@') &&
    amountPattern.exec(text) === null &&
    extractLocalDate(text, 'mdy') === null &&
    extractLocalDate(text, 'dmy') === null
  );
}

function parsePurchaseDate(
  lines: readonly SourceLine[],
  context: ReceiptParserContext,
): ReceiptFieldCandidate | null {
  const eligible = lines.filter(({ text }) => !/\b(?:exp|expires|expiry)\b/i.test(text));
  const prioritized = [
    ...eligible.filter(({ text }) => /\bdate\b/i.test(text)),
    ...eligible.filter(({ text }) => !/\bdate\b/i.test(text)),
  ];

  for (const line of prioritized) {
    const parsed = extractLocalDate(line.text, context.dateOrder);

    if (parsed === null) {
      continue;
    }

    try {
      return {
        boundingBox: line.boundingBox,
        confidence: combineConfidence(line.confidence, parsed.certainty),
        extractedValue: parsed.extractedValue,
        fieldName: 'purchased_at',
        normalizedValue: localDateToOffsetDateTime(parsed.localDate, context.timezoneOffsetMinutes),
        pageNumber: line.pageNumber,
      };
    } catch {
      continue;
    }
  }

  return null;
}

function extractLocalDate(
  text: string,
  dateOrder: DateOrder,
): {
  readonly certainty: number;
  readonly extractedValue: string;
  readonly localDate: string;
} | null {
  const iso = /\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/.exec(text);

  if (iso !== null) {
    return dateMatch(iso[0], Number(iso[1]), Number(iso[2]), Number(iso[3]), 0.98);
  }

  const numeric = /\b(\d{1,2})[/-](\d{1,2})[/-](\d{2}|\d{4})\b/.exec(text);

  if (numeric !== null) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const rawYear = Number(numeric[3]);
    const year = rawYear < 100 ? (rawYear <= 69 ? 2_000 + rawYear : 1_900 + rawYear) : rawYear;
    return dateMatch(
      numeric[0],
      year,
      dateOrder === 'mdy' ? first : second,
      dateOrder === 'mdy' ? second : first,
      rawYear < 100 ? 0.75 : 0.9,
    );
  }

  const monthFirst =
    /\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,)?\s+(\d{4})\b/i.exec(
      text,
    );

  if (monthFirst !== null) {
    return dateMatch(
      monthFirst[0],
      Number(monthFirst[3]),
      monthNumber(monthFirst[1] ?? ''),
      Number(monthFirst[2]),
      0.95,
    );
  }

  const dayFirst =
    /\b(\d{1,2})\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i.exec(
      text,
    );

  return dayFirst === null
    ? null
    : dateMatch(
        dayFirst[0],
        Number(dayFirst[3]),
        monthNumber(dayFirst[2] ?? ''),
        Number(dayFirst[1]),
        0.95,
      );
}

function dateMatch(
  extractedValue: string,
  year: number,
  month: number,
  day: number,
  certainty: number,
): { readonly certainty: number; readonly extractedValue: string; readonly localDate: string } {
  return {
    certainty,
    extractedValue,
    localDate: `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`,
  };
}

function monthNumber(value: string): number {
  return (
    ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(
      value.slice(0, 3).toLowerCase(),
    ) + 1
  );
}

function classifyAmountField(text: string): AmountFieldName | null {
  if (subtotalPattern.test(text)) {
    return 'subtotal_minor';
  }

  if (taxPattern.test(text)) {
    return 'tax_minor';
  }

  if (tipPattern.test(text)) {
    return 'tip_minor';
  }

  if (totalPattern.test(text) && !/\bitems?\b/i.test(text)) {
    return 'total_minor';
  }

  return null;
}

function parseAmount(
  line: SourceLine,
  defaultCurrencyCode: SupportedCurrencyCode,
): ParsedAmount | null {
  const match = amountPattern.exec(line.text);

  if (match === null) {
    return null;
  }

  const prefixCode = normalizeCurrencyCode(match[1]);
  const suffixCode = normalizeCurrencyCode(match[4]);

  if (prefixCode !== null && suffixCode !== null && prefixCode !== suffixCode) {
    return null;
  }

  const symbol = match[2] ?? null;
  const explicitCode = prefixCode ?? suffixCode;
  const symbolCode = currencyCodeForSymbol(symbol, defaultCurrencyCode);

  if (explicitCode !== null && symbolCode !== null && explicitCode !== symbolCode) {
    return null;
  }

  const currencyCode = explicitCode ?? symbolCode ?? defaultCurrencyCode;
  const decimal = normalizeAmount(match[3] ?? '', currencyCode);

  if (decimal === null) {
    return null;
  }

  try {
    return {
      currencyCode,
      currencyToken: explicitCode ?? symbol,
      currencyTokenCertainty: explicitCode !== null ? 0.98 : symbol === '$' ? 0.65 : 0.9,
      extractedValue: match[0].trim(),
      minorUnits: parseDecimalToMinorUnits(decimal, currencyCode),
    };
  } catch {
    return null;
  }
}

function normalizeAmount(value: string, currencyCode: SupportedCurrencyCode): string | null {
  const fractionDigits = getCurrencyFractionDigits(currencyCode);

  if (/^\d+$/.test(value)) {
    return value;
  }

  if (fractionDigits === 0) {
    return /^\d{1,3}(?:[.,]\d{3})+$/.test(value) ? value.replace(/[.,]/g, '') : null;
  }

  const lastComma = value.lastIndexOf(',');
  const lastDot = value.lastIndexOf('.');
  const decimalIndex = Math.max(lastComma, lastDot);
  const trailingDigits = value.length - decimalIndex - 1;

  if (lastComma >= 0 && lastDot >= 0) {
    if (trailingDigits !== fractionDigits) {
      return null;
    }

    const decimalSeparator = lastComma > lastDot ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? /\./g : /,/g;
    return value.replace(thousandsSeparator, '').replace(decimalSeparator, '.');
  }

  if (trailingDigits === fractionDigits) {
    return value.replace(',', '.');
  }

  return /^\d{1,3}(?:[.,]\d{3})+$/.test(value) ? value.replace(/[.,]/g, '') : null;
}

function parseCurrency(
  lines: readonly SourceLine[],
  amountMatches: readonly AmountMatch[],
  defaultCurrencyCode: SupportedCurrencyCode,
): ReceiptFieldCandidate | null {
  const total = [...amountMatches]
    .reverse()
    .find(({ currencyToken, fieldName }) => fieldName === 'total_minor' && currencyToken !== null);
  const fromLabeledAmount =
    total ?? [...amountMatches].reverse().find(({ currencyToken }) => currencyToken !== null);
  const fallback = lines
    .map((line) => ({ amount: parseAmount(line, defaultCurrencyCode), line }))
    .find(({ amount }) => amount?.currencyToken !== null);
  const amount = fromLabeledAmount ?? fallback?.amount;
  const line = fromLabeledAmount?.line ?? fallback?.line;

  if (
    amount === undefined ||
    amount === null ||
    line === undefined ||
    amount.currencyToken === null
  ) {
    return null;
  }

  return {
    boundingBox: line.boundingBox,
    confidence: combineConfidence(line.confidence, amount.currencyTokenCertainty),
    extractedValue: amount.currencyToken,
    fieldName: 'currency_code',
    normalizedValue: amount.currencyCode,
    pageNumber: line.pageNumber,
  };
}

function normalizeCurrencyCode(value: string | undefined): SupportedCurrencyCode | null {
  const normalized = value?.toUpperCase() ?? '';
  return isSupportedCurrencyCode(normalized) ? normalized : null;
}

function currencyCodeForSymbol(
  symbol: string | null,
  defaultCurrencyCode: SupportedCurrencyCode,
): SupportedCurrencyCode | null {
  if (symbol === '$') {
    return ['USD', 'CAD', 'AUD'].includes(defaultCurrencyCode) ? defaultCurrencyCode : 'USD';
  }

  return symbol === '€' ? 'EUR' : symbol === '£' ? 'GBP' : symbol === '¥' ? 'JPY' : null;
}

function amountFieldCertainty(fieldName: AmountFieldName): number {
  return fieldName === 'total_minor' ? 0.95 : fieldName === 'subtotal_minor' ? 0.9 : 0.85;
}

function combineConfidence(ocrConfidence: number, parserCertainty: number): number {
  return Math.round(Math.min(1, Math.max(0, ocrConfidence * parserCertainty)) * 1_000) / 1_000;
}

function assertSafeParserMetadata(parser: ReceiptParser): void {
  if (!safeCodePattern.test(parser.name) || !safeCodePattern.test(parser.version)) {
    throw new TypeError('Receipt parser metadata is invalid.');
  }
}

function assertValidContext(context: ReceiptParserContext): void {
  if (
    !isSupportedCurrencyCode(context.defaultCurrencyCode) ||
    !dateOrderValues.some((dateOrder) => dateOrder === context.dateOrder) ||
    !Number.isInteger(context.timezoneOffsetMinutes) ||
    Math.abs(context.timezoneOffsetMinutes) > 14 * 60
  ) {
    throw new ReceiptParserContextValidationError();
  }
}

function isBoundedCandidateText(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maximumCandidateTextLength &&
    !unsafeTextPattern.test(value)
  );
}

function isNormalizedBoundingBox(value: unknown): value is NormalizedBoundingBox {
  if (!isRecord(value)) {
    return false;
  }

  const { height, width, x, y } = value;
  return (
    typeof height === 'number' &&
    typeof width === 'number' &&
    typeof x === 'number' &&
    typeof y === 'number' &&
    Number.isFinite(height) &&
    Number.isFinite(width) &&
    Number.isFinite(x) &&
    Number.isFinite(y) &&
    height > 0 &&
    width > 0 &&
    x >= 0 &&
    y >= 0 &&
    x + width <= 1 &&
    y + height <= 1
  );
}

function cloneCandidates(
  candidates: readonly ReceiptFieldCandidate[],
): readonly ReceiptFieldCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    boundingBox: candidate.boundingBox === null ? null : { ...candidate.boundingBox },
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
