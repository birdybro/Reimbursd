// SPDX-License-Identifier: GPL-3.0-only
import type { ProcessingHistoryRepository } from '@reimbursd/database';
import type { ReceiptDocument } from '@reimbursd/domain';
import type { OcrOutput } from '@reimbursd/ocr';

import type { AvailabilityAwareOcrProvider } from '../local-ocr-provider';
import { LocalReceiptOcrProcessor } from '../receipt-ocr';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '99999999-9999-4999-8999-999999999999'),
}));

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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('records a successful local run without storing receipt text in history', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    const storage = { read: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) };
    const processor = new LocalReceiptOcrProcessor({ history, provider, storage });

    await expect(processor.process(document)).resolves.toBe('succeeded');
    expect(storage.read).toHaveBeenCalledWith(document.storageReference);
    expect(provider.recognize).toHaveBeenCalledWith(
      expect.objectContaining({
        bytes: Uint8Array.from([1, 2, 3]),
        documentId: document.id,
        receiptId: document.receiptId,
      }),
      undefined,
    );
    expect(history.create).toHaveBeenCalledWith(
      expect.objectContaining({
        affectedFields: [],
        executionLocation: 'local',
        failureCode: null,
        providerName: 'synthetic-local-ocr',
        receiptId: document.receiptId,
        status: 'running',
      }),
    );
    expect(history.complete).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: null, status: 'succeeded' }),
    );
  });

  test('records unavailable runtimes without reading attachment bytes', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    provider.getAvailability.mockResolvedValue({
      available: false,
      code: 'development_build_required',
    });
    const storage = { read: jest.fn() };
    const processor = new LocalReceiptOcrProcessor({ history, provider, storage });

    await expect(processor.process(document)).resolves.toBe('unavailable');
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
    const processor = new LocalReceiptOcrProcessor({
      history,
      provider,
      storage: { read: jest.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])) },
    });

    await expect(processor.process(document)).resolves.toBe('failed');
    expect(history.complete).toHaveBeenCalledWith(
      expect.objectContaining({ failureCode: 'invalid_output', status: 'failed' }),
    );
  });

  test('leaves PDFs for the future page-rasterization stage', async () => {
    const history = createHistoryRepository();
    const provider = createProvider();
    const storage = { read: jest.fn() };
    const processor = new LocalReceiptOcrProcessor({ history, provider, storage });

    await expect(
      processor.process({
        ...document,
        heightPixels: null,
        mimeType: 'application/pdf',
        widthPixels: null,
      }),
    ).resolves.toBe('unsupported');
    expect(history.create).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });
});
