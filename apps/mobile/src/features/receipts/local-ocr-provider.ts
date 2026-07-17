// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';
import { File as ExpoFile, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import {
  defaultOcrLimits,
  OcrCancelledError,
  type OcrBlock,
  type OcrCancellationSignal,
  type OcrInput,
  type OcrOutput,
  type OcrProvider,
} from '@reimbursd/ocr';

import { getReimbursdVisionOcrModule } from '../../../modules/reimbursd-vision-ocr';

export type LocalOcrUnavailableCode =
  | 'development_build_required'
  | 'device_unsupported'
  | 'native_module_unavailable'
  | 'unsupported_platform';

export type LocalOcrAvailability =
  | { readonly available: true }
  | { readonly available: false; readonly code: LocalOcrUnavailableCode };

export interface AvailabilityAwareOcrProvider extends OcrProvider {
  getAvailability(): Promise<LocalOcrAvailability>;
}

export class LocalOcrUnavailableError extends Error {
  readonly code: LocalOcrUnavailableCode;

  constructor(code: LocalOcrUnavailableCode) {
    super('Local OCR is unavailable in this runtime.');
    this.name = 'LocalOcrUnavailableError';
    this.code = code;
  }
}

export class AppleVisionOcrProvider implements AvailabilityAwareOcrProvider {
  readonly executionLocation = 'local' as const;
  readonly name = 'reimbursd-apple-vision-ocr';
  readonly version = '1.0.0';

  async getAvailability(): Promise<LocalOcrAvailability> {
    if (Platform.OS !== 'ios') {
      return { available: false, code: 'unsupported_platform' };
    }

    return getReimbursdVisionOcrModule() === null
      ? { available: false, code: 'development_build_required' }
      : { available: true };
  }

  async recognize(input: OcrInput, cancellation?: OcrCancellationSignal): Promise<OcrOutput> {
    if (input.mimeType === 'application/pdf') {
      throw new LocalOcrUnavailableError('device_unsupported');
    }

    const availability = await this.getAvailability();

    if (!availability.available) {
      throw new LocalOcrUnavailableError(availability.code);
    }

    const nativeModule = getReimbursdVisionOcrModule();

    if (nativeModule === null) {
      throw new LocalOcrUnavailableError('native_module_unavailable');
    }

    throwIfCancelled(cancellation);
    const extension = input.mimeType === 'image/png' ? 'png' : 'jpg';
    const temporaryFile = new ExpoFile(
      Paths.cache,
      'reimbursd-ocr',
      `${input.documentId}-${randomUUID()}.${extension}`,
    );
    let processingError: unknown;

    try {
      temporaryFile.create({ intermediates: true, overwrite: false });
      temporaryFile.write(input.bytes);
      throwIfCancelled(cancellation);
      const result: unknown = await nativeModule.recognizeText(temporaryFile.uri);
      throwIfCancelled(cancellation);
      return mapNativeOcrResult(result);
    } catch (error) {
      processingError = error;
      throw error;
    } finally {
      try {
        if (temporaryFile.exists) {
          temporaryFile.delete();
        }
      } catch (cleanupError) {
        if (processingError === undefined) {
          throw cleanupError;
        }

        throw new AggregateError(
          [processingError, cleanupError],
          'Local OCR processing and private cache cleanup both failed.',
        );
      }
    }
  }
}

export function mapNativeOcrResult(value: unknown): OcrOutput {
  if (!isRecord(value) || typeof value.text !== 'string' || !Array.isArray(value.blocks)) {
    throw new TypeError('The native OCR response is invalid.');
  }

  const blocks: OcrBlock[] = [];

  for (const valueBlock of value.blocks.slice(0, defaultOcrLimits.maximumBlockCount + 1)) {
    const block = mapNativeTextBlock(valueBlock);

    if (block !== null) {
      blocks.push(block);
    }
  }

  return { pages: [{ blocks, pageNumber: 1, text: value.text }] };
}

function mapNativeTextBlock(value: unknown): OcrBlock | null {
  if (!isRecord(value) || typeof value.text !== 'string' || typeof value.confidence !== 'number') {
    throw new TypeError('The native OCR response contains invalid text.');
  }

  if (value.text.length === 0) {
    return null;
  }

  return {
    boundingBox: normalizeBoundingBox(value.boundingBox),
    confidence: value.confidence,
    text: value.text,
  };
}

function normalizeBoundingBox(value: unknown): OcrBlock['boundingBox'] {
  if (!isRecord(value)) {
    return null;
  }

  const { height, width, x, y } = value;

  if (
    typeof height !== 'number' ||
    typeof width !== 'number' ||
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    !Number.isFinite(height) ||
    !Number.isFinite(width) ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    height <= 0 ||
    width <= 0 ||
    x < 0 ||
    y < 0 ||
    x + width > 1 ||
    y + height > 1
  ) {
    return null;
  }

  return { height, width, x, y };
}

function throwIfCancelled(cancellation: OcrCancellationSignal | undefined): void {
  if (cancellation?.aborted) {
    throw new OcrCancelledError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
