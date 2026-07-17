// SPDX-License-Identifier: GPL-3.0-only
import { mapNativeOcrResult } from '../local-ocr-provider';

describe('Apple Vision OCR output adapter', () => {
  test('preserves normalized source boxes and model confidence', () => {
    expect(
      mapNativeOcrResult({
        blocks: [
          {
            boundingBox: { height: 0.05, width: 0.3, x: 0.1, y: 0.2 },
            confidence: 0.96,
            text: 'TOTAL $13.34',
          },
        ],
        text: 'SYNTHETIC MARKET\nTOTAL $13.34',
      }),
    ).toEqual({
      pages: [
        {
          blocks: [
            {
              boundingBox: { height: 0.05, width: 0.3, x: 0.1, y: 0.2 },
              confidence: 0.96,
              text: 'TOTAL $13.34',
            },
          ],
          pageNumber: 1,
          text: 'SYNTHETIC MARKET\nTOTAL $13.34',
        },
      ],
    });
  });

  test('drops invalid geometry while retaining recognized text for review', () => {
    const output = mapNativeOcrResult({
      blocks: [
        {
          boundingBox: { height: 0.1, width: 0.3, x: 0.9, y: 0.9 },
          confidence: 0.8,
          text: 'SYNTHETIC MARKET',
        },
      ],
      text: 'SYNTHETIC MARKET',
    });

    expect(output.pages[0]?.blocks[0]).toMatchObject({
      boundingBox: null,
      text: 'SYNTHETIC MARKET',
    });
  });

  test('rejects malformed native responses at the adapter boundary', () => {
    expect(() => mapNativeOcrResult({ blocks: 'invalid', text: 7 })).toThrow(
      'The native OCR response is invalid.',
    );
  });
});
