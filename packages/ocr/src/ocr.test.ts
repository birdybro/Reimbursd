// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';

import {
  DeterministicOcrProvider,
  OcrCancelledError,
  OcrInputValidationError,
  OcrOutputValidationError,
  runOcrProvider,
  validateOcrOutput,
  type OcrInput,
  type OcrOutput,
  type OcrProvider,
} from './ocr.js';

const output: OcrOutput = {
  pages: [
    {
      blocks: [
        {
          boundingBox: { height: 0.04, width: 0.18, x: 0.7, y: 0.82 },
          confidence: 0.96,
          text: 'TOTAL $13.34',
        },
      ],
      pageNumber: 1,
      text: 'SYNTHETIC MARKET\nTOTAL $13.34',
    },
  ],
};
const input: OcrInput = {
  bytes: Uint8Array.from([1, 2, 3]),
  documentId: '11111111-1111-4111-8111-111111111111',
  mimeType: 'image/png',
  pageCount: 1,
  receiptId: '22222222-2222-4222-8222-222222222222',
};

describe('OCR provider boundary', () => {
  it('returns a defensive copy from the deterministic local provider', async () => {
    const provider = new DeterministicOcrProvider(output);
    const result = await runOcrProvider(provider, input);

    expect(result).toEqual(output);
    expect(result).not.toBe(output);
    expect(result.pages[0]).not.toBe(output.pages[0]);
  });

  it('passes a byte copy so a provider cannot mutate the preserved input', async () => {
    const recognize = vi.fn<OcrProvider['recognize']>(async (providerInput) => {
      providerInput.bytes.fill(9);
      return output;
    });
    const provider: OcrProvider = {
      executionLocation: 'local',
      name: 'synthetic-provider',
      recognize,
      version: '1.0.0',
    };

    await runOcrProvider(provider, input);

    expect(input.bytes).toEqual(Uint8Array.from([1, 2, 3]));
  });

  it('rejects invalid input before invoking the provider', async () => {
    const provider = new DeterministicOcrProvider(output);

    await expect(
      runOcrProvider(provider, { ...input, bytes: new Uint8Array() }),
    ).rejects.toBeInstanceOf(OcrInputValidationError);
  });

  it('schema-validates untrusted provider output', async () => {
    const provider: OcrProvider = {
      executionLocation: 'remote',
      name: 'synthetic-provider',
      recognize: vi.fn(async () => ({ pages: [{ pageNumber: 1, text: 7 }] })),
      version: '1.0.0',
    };

    await expect(runOcrProvider(provider, input)).rejects.toBeInstanceOf(OcrOutputValidationError);
  });

  it('rejects oversized text and invalid normalized boxes', () => {
    const issues = validateOcrOutput(
      {
        pages: [
          {
            blocks: [
              {
                boundingBox: { height: 0.2, width: 0.4, x: 0.8, y: 0.9 },
                confidence: 2,
                text: 'x'.repeat(20),
              },
            ],
            pageNumber: 1,
            text: 'x'.repeat(20),
          },
        ],
      },
      1,
      {
        maximumBlockCount: 10,
        maximumBlockTextLength: 10,
        maximumByteSize: 100,
        maximumPageCount: 1,
        maximumTotalTextLength: 30,
      },
    );

    expect(issues).toEqual(
      expect.arrayContaining([
        'OCR block bounding box must be a positive normalized page rectangle.',
        'OCR block confidence must be between 0 and 1.',
        'OCR block text is invalid or too large.',
        'OCR output contains too much text.',
      ]),
    );
  });

  it('rejects empty OCR blocks', () => {
    expect(
      validateOcrOutput(
        {
          pages: [
            {
              blocks: [{ boundingBox: null, confidence: 1, text: '' }],
              pageNumber: 1,
              text: '',
            },
          ],
        },
        1,
      ),
    ).toContain('OCR block text is invalid or too large.');
  });

  it('honors cancellation before provider execution', async () => {
    const provider = new DeterministicOcrProvider(output);

    await expect(
      runOcrProvider(provider, input, { cancellation: { aborted: true } }),
    ).rejects.toBeInstanceOf(OcrCancelledError);
  });
});
