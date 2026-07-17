// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';

import type { FieldEvidenceRepository, ProcessingHistoryRepository } from '@reimbursd/database';
import type { FieldEvidence, ProcessingHistory, ReceiptDocument } from '@reimbursd/domain';
import {
  ReceiptParserContextValidationError,
  ReceiptParserOutputValidationError,
  runReceiptParser,
  type ReceiptParser,
  type ReceiptParserContext,
} from '@reimbursd/extraction';
import {
  OcrCancelledError,
  OcrInputValidationError,
  OcrOutputValidationError,
  runOcrProvider,
} from '@reimbursd/ocr';

import type { LocalAttachmentStorage } from '../../storage/local-attachments';
import { LocalOcrUnavailableError, type AvailabilityAwareOcrProvider } from './local-ocr-provider';

export type ReceiptOcrOutcome = 'failed' | 'succeeded' | 'unavailable' | 'unsupported';

export interface ReceiptOcrProcessInput {
  readonly document: ReceiptDocument;
  readonly parserContext: ReceiptParserContext;
}

export class LocalReceiptOcrProcessor {
  readonly #evidence: FieldEvidenceRepository;
  readonly #history: ProcessingHistoryRepository;
  readonly #parser: ReceiptParser;
  readonly #provider: AvailabilityAwareOcrProvider;
  readonly #storage: Pick<LocalAttachmentStorage, 'read'>;

  constructor(dependencies: {
    readonly evidence: FieldEvidenceRepository;
    readonly history: ProcessingHistoryRepository;
    readonly parser: ReceiptParser;
    readonly provider: AvailabilityAwareOcrProvider;
    readonly storage: Pick<LocalAttachmentStorage, 'read'>;
  }) {
    this.#evidence = dependencies.evidence;
    this.#history = dependencies.history;
    this.#parser = dependencies.parser;
    this.#provider = dependencies.provider;
    this.#storage = dependencies.storage;
  }

  async process({ document, parserContext }: ReceiptOcrProcessInput): Promise<ReceiptOcrOutcome> {
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

    let output: Awaited<ReturnType<typeof runOcrProvider>>;

    try {
      const bytes = await this.#storage.read(document.storageReference);
      output = await runOcrProvider(this.#provider, {
        bytes,
        documentId: document.id,
        mimeType: document.mimeType,
        pageCount: document.pageCount,
        receiptId: document.receiptId,
      });
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

    await this.#completeSucceeded(history.id, [], 'not_applicable');
    await this.#parseAndPersist(document.receiptId, output, parserContext);
    return 'succeeded';
  }

  async #parseAndPersist(
    receiptId: string,
    output: Parameters<typeof runReceiptParser>[1],
    parserContext: ReceiptParserContext,
  ): Promise<void> {
    const parserHistory: ProcessingHistory = {
      affectedFields: [],
      completedAt: null,
      executionLocation: 'local',
      failureCode: null,
      id: randomUUID(),
      modelVersion: null,
      processorName: this.#parser.name,
      processorVersion: this.#parser.version,
      providerName: 'reimbursd-local-parser',
      receiptId,
      reviewStatus: 'not_applicable',
      startedAt: new Date().toISOString(),
      status: 'running',
    };
    await this.#history.create(parserHistory);

    let candidates: ReturnType<typeof runReceiptParser>;

    try {
      candidates = runReceiptParser(this.#parser, output, parserContext);
    } catch (error) {
      await this.#completeFailed(parserHistory.id, getParserFailureCode(error));
      return;
    }

    const processedAt = new Date().toISOString();
    const evidence: readonly FieldEvidence[] = candidates.map((candidate) => ({
      acceptedAt: null,
      boundingBox: candidate.boundingBox,
      confidence: candidate.confidence,
      correctedAt: null,
      extractedValue: candidate.extractedValue,
      fieldName: candidate.fieldName,
      id: randomUUID(),
      normalizedValue: candidate.normalizedValue,
      pageNumber: candidate.pageNumber,
      processedAt,
      processorName: this.#parser.name,
      processorVersion: this.#parser.version,
      receiptId,
      sourceType: 'deterministic_parser',
    }));

    try {
      await this.#evidence.createMany(evidence);
    } catch {
      await this.#completeFailed(parserHistory.id, 'candidate_persistence_failed');
      return;
    }

    await this.#completeSucceeded(
      parserHistory.id,
      evidence.map(({ fieldName }) => fieldName),
      evidence.length === 0 ? 'not_applicable' : 'pending',
    );
  }

  async #completeSucceeded(
    id: string,
    affectedFields: Parameters<ProcessingHistoryRepository['complete']>[0]['affectedFields'],
    reviewStatus: 'not_applicable' | 'pending',
  ): Promise<void> {
    await this.#history.complete({
      affectedFields,
      completedAt: new Date().toISOString(),
      failureCode: null,
      id,
      reviewStatus,
      status: 'succeeded',
    });
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

function getParserFailureCode(error: unknown): string {
  if (error instanceof ReceiptParserContextValidationError) {
    return 'invalid_parser_context';
  }

  if (error instanceof ReceiptParserOutputValidationError) {
    return 'invalid_parser_output';
  }

  if (error instanceof OcrOutputValidationError) {
    return 'invalid_ocr_output';
  }

  return 'parser_failed';
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
