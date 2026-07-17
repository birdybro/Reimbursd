// SPDX-License-Identifier: GPL-3.0-only
import type { FieldEvidenceRepository, ProcessingHistoryRepository } from '@reimbursd/database';
import type { ReceiptDocument } from '@reimbursd/domain';
import { DeterministicReceiptParser } from '@reimbursd/extraction';
import type { OcrOutput } from '@reimbursd/ocr';

import type { AvailabilityAwareOcrProvider } from '../local-ocr-provider';
import { LocalReceiptOcrProcessor } from '../receipt-ocr';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(),
}));

const mockRandomUUID = jest.requireMock('expo-crypto').randomUUID as jest.Mock;

const document: ReceiptDocument = {
  byteSize: 3,
  createdAt: '2026-07-15T12:00:00.000Z',
  heightPixels: 800,
  id: '11111111-1111-4111-8111-111111111111',
  isOriginal: false,
  mimeType: 'image/png',
  originalFilename: 'receipt-preview.png',
  pageCount: 1,
  parentDocumentId: '22222222-2222-4222-8222-222222222222',
  receiptId: '33333333-3333-4333-8333-333333333333',
  sha256: 'a'.repeat(64),
  sourceType: 'derivative',
  storageDeletedAt: null,
  storageReference:
    'receipt-documents/33333333-3333-4333-8333-333333333333/derivatives/11111111-1111-4111-8111-111111111111.png',
  widthPixels: 1_000,
};

const output: OcrOutput = {
  pages: [
    {
      blocks: [{ boundingBox: null, confidence: 0.5, text: 'TOTAL $13.34' }],
      pageNumber: 1,
      text: 'TOTAL $13.34',
    },
  ],
};

function createHistoryRepository(): jest.Mocked<ProcessingHistoryRepository> {
  return {
    complete: jest.fn(),
    create: jest.fn(async (history) => history),
    getById: jest.fn(),
    listByReceiptId: jest.fn(),
  };
}

function createEvidenceRepository(): jest.Mocked<FieldEvidenceRepository> {
  return {
    create: jest.fn(async (evidence) => evidence),
    createMany: jest.fn(async (evidence) => evidence),
    getPreferred: jest.fn(),
    listByReceiptId: jest.fn(),
  };
}

function createProvider(): jest.Mocked<AvailabilityAwareOcrProvider> {
  return {
    executionLocation: 'local',
    getAvailability: jest.fn().mockResolvedValue({ available: true }),
    name: 'synthetic-local-ocr',
    recognize: jest.fn().mockResolvedValue(output),
    version: '1.0.0',
  };
}

describe('local receipt OCR processing', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-07-15T12:00:00.000Z'));
    let id = 0;
    mockRandomUUID.mockReset().mockImplementation(() => {
      id += 1;
      return `99999999-9999-4999-8999-${id.toString().padStart(12, '0')}`;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('records a successful local run without storing receipt text in history', async () => {
    const history = createHistoryRepository();
    const evidence = createEvidenceRepository();
    const provider = createProvider();
    const storage = { read: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) };
    const processor = createProcessor({ evidence, history, provider, storage });

    await expect(processor.process(processInput())).resolves.toBe('succeeded');
    expect(storage.read).toHaveBeenCalledWith(document.storageReference);
    expect(provider.recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Uint8Array.from([1, 2, 3]),
        documentId: document.id,
        receiptId: document.receiptId,
      }),
      undefined,
    );
    expect(history.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        affectedFields: [],
        executionLocation: 'local',
        failureCode: null,
        providerName: 'synthetic-local-ocr',
        receiptId: document.receiptId,
        status: 'running',
      }),
    );
    expect(history.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        processorName: 'reimbursd-deterministic-parser',
        providerName: 'reimbursd-local-parser',
        status: 'running',
      }),
    );
    expect(evidence.createMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          acceptedAt: null,
          fieldName: 'currency_code',
          normalizedValue: 'USD',
          sourceType: 'deterministic_parser',
        }),
        expect.objectContaining({
          acceptedAt: null,
          fieldName: 'total_minor',
          normalizedValue: '1334',
          sourceType: 'deterministic_parser',
        }),
      ]),
    );
    expect(history.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        affectedFields: ['currency_code', 'total_minor'],
        failureCode: null,
        reviewStatus: 'pending',
        status: 'succeeded',
      }),
    );
    expect(JSON.stringify(history.create.mock.calls)).not.toContain('TOTAL $13.34');
  });

  test('records unavailable runtimes without reading attachment bytes', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    provider.getAvailability.mockResolvedValue({
      available: false,
      code: 'development_build_required',
    });
    const storage = { read: jest.fn() };
    const processor = createProcessor({ history, provider, storage });

    await expect(processor.process(processInput())).resolves.toBe('unavailable');
    expect(storage.read).not.toHaveBeenCalled();
    expect(provider.recognize).not.toHaveBeenCalled();
    expect(history.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        failureCode: 'development_build_required',
        status: 'failed',
      }),
    );
  });

  test('redacts invalid provider output to a stable failure code', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    provider.recognize.mockResolvedValue({ pages: [{ text: 7 }] });
    const processor = createProcessor({
      history,
      provider,
      storage: { read: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) },
    });

    await expect(processor.process(processInput())).resolves.toBe('failed');
    expect(history.complete).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'invalid_output', status: 'failed' }),
    );
  });

  test('leaves PDFs for the future page-rasterization stage', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    const storage = { read: jest.fn() };
    const processor = createProcessor({ history, provider, storage });

    await expect(
      processor.process(
        processInput({
          ...document,
          heightPixels: null,
          mimeType: 'application/pdf',
          widthPixels: null,
        }),
      ),
    ).resolves.toBe('unsupported');
    expect(history.create).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });

  test('records candidate persistence failure without changing successful OCR history', async () => {
    const history = createHistoryRepository();
    const evidence = createEvidenceRepository();
    evidence.createMany.mockRejectedValue(new Error('Synthetic storage failure.'));
    const processor = createProcessor({
      evidence,
      history,
      provider: createProvider(),
      storage: { read: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) },
    });

    await expect(processor.process(processInput())).resolves.toBe('succeeded');
    expect(history.complete).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ status: 'succeeded' }),
    );
    expect(history.complete).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        failureCode: 'candidate_persistence_failed',
        status: 'failed',
      }),
    );
  });
});

function createProcessor(dependencies: {
  readonly evidence?: jest.Mocked<FieldEvidenceRepository>;
  readonly history: jest.Mocked<ProcessingHistoryRepository>;
  readonly provider: jest.Mocked<AvailabilityAwareOcrProvider>;
  readonly storage: { readonly read: jest.Mock };
}): LocalReceiptOcrProcessor {
  return new LocalReceiptOcrProcessor({
    evidence: dependencies.evidence ?? createEvidenceRepository(),
    history: dependencies.history,
    parser: new DeterministicReceiptParser(),
    provider: dependencies.provider,
    storage: dependencies.storage,
  });
}

function processInput(documentOverride: ReceiptDocument = document) {
  return {
    document: documentOverride,
    parserContext: {
      dateOrder: 'mdy' as const,
      defaultCurrencyCode: 'USD' as const,
      timezoneOffsetMinutes: 360,
    },
  };
}
