// SPDX-License-Identifier: GPL-3.0-only
import {
  isReceiptDocumentMimeType,
  isUuid,
  processingExecutionLocations,
  type NormalizedBoundingBox,
  type ProcessingExecutionLocation,
  type ReceiptDocumentMimeType,
} from '@reimbursd/domain';

const safeCodePattern = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const unsafeTextPattern = /[\u0000\u000b\u000c\u000e-\u001f\u007f]/;

export interface OcrLimits {
  readonly maximumBlockCount: number;
  readonly maximumBlockTextLength: number;
  readonly maximumByteSize: number;
  readonly maximumPageCount: number;
  readonly maximumTotalTextLength: number;
}

export const defaultOcrLimits: OcrLimits = {
  maximumBlockCount: 5_000,
  maximumBlockTextLength: 8_192,
  maximumByteSize: 25 * 1024 * 1024,
  maximumPageCount: 100,
  maximumTotalTextLength: 200_000,
};

export interface OcrInput {
  readonly bytes: Uint8Array;
  readonly documentId: string;
  readonly mimeType: ReceiptDocumentMimeType;
  readonly pageCount: number;
  readonly receiptId: string;
}

export interface OcrBlock {
  readonly boundingBox: NormalizedBoundingBox | null;
  readonly confidence: number;
  readonly text: string;
}

export interface OcrPage {
  readonly blocks: readonly OcrBlock[];
  readonly pageNumber: number;
  readonly text: string;
}

export interface OcrOutput {
  readonly pages: readonly OcrPage[];
}

export interface OcrCancellationSignal {
  readonly aborted: boolean;
}

export interface OcrProvider {
  readonly executionLocation: ProcessingExecutionLocation;
  readonly name: string;
  readonly version: string;
  recognize(input: OcrInput, cancellation?: OcrCancellationSignal): Promise<unknown>;
}

export class OcrInputValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('OCR input is invalid.');
    this.name = 'OcrInputValidationError';
    this.issues = issues;
  }
}

export class OcrOutputValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super('OCR provider output is invalid.');
    this.name = 'OcrOutputValidationError';
    this.issues = issues;
  }
}

export class OcrCancelledError extends Error {
  constructor() {
    super('OCR processing was cancelled.');
    this.name = 'OcrCancelledError';
  }
}

export async function runOcrProvider(
  provider: OcrProvider,
  input: OcrInput,
  options: {
    readonly cancellation?: OcrCancellationSignal;
    readonly limits?: OcrLimits;
  } = {},
): Promise<OcrOutput> {
  const limits = options.limits ?? defaultOcrLimits;
  assertValidLimits(limits);
  assertSafeProviderMetadata(provider);
  const inputIssues = validateOcrInput(input, limits);

  if (inputIssues.length > 0) {
    throw new OcrInputValidationError(inputIssues);
  }

  throwIfCancelled(options.cancellation);
  const providerInput: OcrInput = { ...input, bytes: input.bytes.slice() };
  const output = await provider.recognize(providerInput, options.cancellation);
  throwIfCancelled(options.cancellation);
  const outputIssues = validateOcrOutput(output, input.pageCount, limits);

  if (outputIssues.length > 0) {
    throw new OcrOutputValidationError(outputIssues);
  }

  return cloneOcrOutput(output as OcrOutput);
}

export function validateOcrInput(
  input: OcrInput,
  limits: OcrLimits = defaultOcrLimits,
): readonly string[] {
  const issues: string[] = [];

  if (!isUuid(input.documentId)) {
    issues.push('Document identifier must be a UUID.');
  }

  if (!isUuid(input.receiptId)) {
    issues.push('Receipt identifier must be a UUID.');
  }

  if (!isReceiptDocumentMimeType(input.mimeType)) {
    issues.push('OCR MIME type is not supported.');
  }

  if (input.bytes.byteLength === 0 || input.bytes.byteLength > limits.maximumByteSize) {
    issues.push('OCR input byte size is outside the configured limit.');
  }

  if (
    !Number.isSafeInteger(input.pageCount) ||
    input.pageCount <= 0 ||
    input.pageCount > limits.maximumPageCount
  ) {
    issues.push('OCR input page count is outside the configured limit.');
  }

  return issues;
}

export function validateOcrOutput(
  value: unknown,
  inputPageCount: number,
  limits: OcrLimits = defaultOcrLimits,
): readonly string[] {
  const issues: string[] = [];

  if (!isRecord(value) || !Array.isArray(value.pages)) {
    return ['OCR output must contain a pages array.'];
  }

  if (value.pages.length === 0 || value.pages.length > inputPageCount) {
    issues.push('OCR output page count is invalid.');
  }

  let blockCount = 0;
  let textLength = 0;
  const pageNumbers = new Set<number>();

  for (const page of value.pages.slice(0, limits.maximumPageCount + 1)) {
    if (!isRecord(page) || !Array.isArray(page.blocks) || typeof page.text !== 'string') {
      issues.push('Each OCR page must contain text and a blocks array.');
      continue;
    }

    if (
      !Number.isSafeInteger(page.pageNumber) ||
      typeof page.pageNumber !== 'number' ||
      page.pageNumber <= 0 ||
      page.pageNumber > inputPageCount ||
      pageNumbers.has(page.pageNumber)
    ) {
      issues.push('OCR page numbers must be unique and within the input document.');
    } else {
      pageNumbers.add(page.pageNumber);
    }

    if (!isSafeOcrText(page.text, limits.maximumTotalTextLength)) {
      issues.push('OCR page text is invalid or too large.');
    }
    textLength += page.text.length;
    blockCount += page.blocks.length;

    for (const block of page.blocks.slice(0, limits.maximumBlockCount + 1)) {
      validateOcrBlock(block, limits, issues);
      if (isRecord(block) && typeof block.text === 'string') {
        textLength += block.text.length;
      }
    }
  }

  if (blockCount > limits.maximumBlockCount) {
    issues.push('OCR output contains too many text blocks.');
  }

  if (textLength > limits.maximumTotalTextLength) {
    issues.push('OCR output contains too much text.');
  }

  return issues;
}

export class DeterministicOcrProvider implements OcrProvider {
  readonly executionLocation = 'local' as const;
  readonly name = 'reimbursd-deterministic-ocr';
  readonly version = '1.0.0';
  readonly #output: OcrOutput;

  constructor(output: OcrOutput) {
    const issues = validateOcrOutput(output, defaultOcrLimits.maximumPageCount);

    if (issues.length > 0) {
      throw new OcrOutputValidationError(issues);
    }

    this.#output = cloneOcrOutput(output);
  }

  async recognize(_input: OcrInput, cancellation?: OcrCancellationSignal): Promise<OcrOutput> {
    throwIfCancelled(cancellation);
    return cloneOcrOutput(this.#output);
  }
}

function validateOcrBlock(value: unknown, limits: OcrLimits, issues: string[]): void {
  if (!isRecord(value) || typeof value.text !== 'string' || typeof value.confidence !== 'number') {
    issues.push('Each OCR block must contain text, confidence, and an optional bounding box.');
    return;
  }

  if (value.text.length === 0 || !isSafeOcrText(value.text, limits.maximumBlockTextLength)) {
    issues.push('OCR block text is invalid or too large.');
  }

  if (!Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) {
    issues.push('OCR block confidence must be between 0 and 1.');
  }

  if (value.boundingBox !== null && !isNormalizedBoundingBox(value.boundingBox)) {
    issues.push('OCR block bounding box must be a positive normalized page rectangle.');
  }
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

function isSafeOcrText(value: string, maximumLength: number): boolean {
  return value.length <= maximumLength && !unsafeTextPattern.test(value);
}

function assertSafeProviderMetadata(provider: OcrProvider): void {
  if (
    !safeCodePattern.test(provider.name) ||
    !safeCodePattern.test(provider.version) ||
    !processingExecutionLocations.some((location) => location === provider.executionLocation)
  ) {
    throw new TypeError('OCR provider metadata is invalid.');
  }
}

function assertValidLimits(limits: OcrLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive safe integer.`);
    }
  }
}

function throwIfCancelled(cancellation: OcrCancellationSignal | undefined): void {
  if (cancellation?.aborted) {
    throw new OcrCancelledError();
  }
}

function cloneOcrOutput(output: OcrOutput): OcrOutput {
  return {
    pages: output.pages.map((page) => ({
      blocks: page.blocks.map((block) => ({
        boundingBox: block.boundingBox === null ? null : { ...block.boundingBox },
        confidence: block.confidence,
        text: block.text,
      })),
      pageNumber: page.pageNumber,
      text: page.text,
    })),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
