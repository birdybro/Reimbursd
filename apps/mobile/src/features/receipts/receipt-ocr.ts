// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';

import type { ProcessingHistoryRepository } from '@reimbursd/database';
import type { ProcessingHistory, ReceiptDocument } from '@reimbursd/domain';
import {
  OcrCancelledError,
  OcrInputValidationError,
  OcrOutputValidationError,
  runOcrProvider,
} from '@reimbursd/ocr';

import type { LocalAttachmentStorage } from '../../storage/local-attachments';
import { LocalOcrUnavailableError, type AvailabilityAwareOcrProvider } from './local-ocr-provider';

export type ReceiptOcrOutcome = 'failed' | 'succeeded' | 'unavailable' | 'unsupported';

export class LocalReceiptOcrProcessor {
  readonly #history: ProcessingHistoryRepository;
  readonly #provider: AvailabilityAwareOcrProvider;
  readonly #storage: Pick<LocalAttachmentStorage, 'read'>;

  constructor(dependencies: {
    readonly history: ProcessingHistoryRepository;
    readonly provider: AvailabilityAwareOcrProvider;
    readonly storage: Pick<LocalAttachmentStorage, 'read'>;
  }) {
    this.#history = dependencies.history;
    this.#provider = dependencies.provider;
    this.#storage = dependencies.storage;
  }

  async process(document: ReceiptDocument): Promise<ReceiptOcrOutcome> {
    if (document.mimeType === 'application/pdf') {
      return 'unsupported';
    }

    const startedAt = new Date().toISOString();
    const history: ProcessingHistory = {
      affectedFields: [],
      completedAt: null,
      executionLocation: this.#provider.executionLocation,
      failureCode: null,
      id: randomUUID(),
      modelVersion: null,
      processorName: 'reimbursd-receipt-ocr',
      processorVersion: '1.0.0',
      providerName: this.#provider.name,
      receiptId: document.receiptId,
      reviewStatus: 'not_applicable',
      startedAt,
      status: 'running',
    };
    await this.#history.create(history);
    const availability = await this.#provider.getAvailability();

    if (!availability.available) {
      await this.#completeFailed(history.id, availability.code);
      return 'unavailable';
    }

    try {
      const bytes = await this.#storage.read(document.storageReference);
      await runOcrProvider(this.#provider, {
        bytes,
        documentId: document.id,
        mimeType: document.mimeType,
        pageCount: document.pageCount,
        receiptId: document.receiptId,
      });
      await this.#history.complete({
        affectedFields: [],
        completedAt: new Date().toISOString(),
        failureCode: null,
        id: history.id,
        reviewStatus: 'not_applicable',
        status: 'succeeded',
      });
      return 'succeeded';
    } catch (error) {
      if (error instanceof OcrCancelledError) {
        await this.#history.complete({
          affectedFields: [],
          completedAt: new Date().toISOString(),
          failureCode: null,
          id: history.id,
          reviewStatus: 'not_applicable',
          status: 'cancelled',
        });
        return 'failed';
      }

      const failureCode = getFailureCode(error);
      await this.#completeFailed(history.id, failureCode);
      return error instanceof LocalOcrUnavailableError ? 'unavailable' : 'failed';
    }
  }

  async #completeFailed(id: string, failureCode: string): Promise<void> {
    await this.#history.complete({
      affectedFields: [],
      completedAt: new Date().toISOString(),
      failureCode,
      id,
      reviewStatus: 'not_applicable',
      status: 'failed',
    });
  }
}

function getFailureCode(error: unknown): string {
  if (error instanceof LocalOcrUnavailableError) {
    return error.code;
  }

  if (error instanceof OcrInputValidationError) {
    return 'invalid_input';
  }

  if (error instanceof OcrOutputValidationError || error instanceof TypeError) {
    return 'invalid_output';
  }

  if (error instanceof AggregateError) {
    return 'processing_cleanup_failed';
  }

  return 'processing_failed';
}
