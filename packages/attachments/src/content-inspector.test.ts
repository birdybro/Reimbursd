// SPDX-License-Identifier: GPL-3.0-only
import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js';
import { describe, expect, it } from 'vitest';

import { AttachmentInspectionError, PdfLibAttachmentInspector } from './content-inspector.js';

const onePixelPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0,
  0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24,
  227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const syntheticJpeg = Uint8Array.from([
  255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 255, 219, 0, 67, 0, 6, 4,
  5, 6, 5, 4, 6, 6, 5, 6, 7, 7, 6, 8, 10, 16, 10, 10, 9, 9, 10, 20, 14, 15, 12, 16, 23, 20, 24, 24,
  23, 20, 22, 22, 26, 29, 37, 31, 26, 27, 35, 28, 22, 22, 32, 44, 32, 35, 38, 39, 41, 42, 41, 25,
  31, 45, 48, 45, 40, 48, 37, 40, 41, 40, 255, 192, 0, 11, 8, 0, 3, 0, 2, 1, 1, 17, 0, 255, 196, 0,
  20, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 255, 196, 0, 20, 16, 1, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 218, 0, 8, 1, 1, 0, 0, 63, 0, 84, 191, 255, 217,
]);

describe('PDF and image content inspection', () => {
  it('derives PNG MIME type and dimensions from file contents', async () => {
    const inspector = new PdfLibAttachmentInspector();

    await expect(inspector.inspect(onePixelPng)).resolves.toEqual({
      heightPixels: 1,
      mimeType: 'image/png',
      pageCount: 1,
      widthPixels: 1,
    });
  });

  it('derives JPEG MIME type and dimensions from file contents', async () => {
    await expect(new PdfLibAttachmentInspector().inspect(syntheticJpeg)).resolves.toEqual({
      heightPixels: 3,
      mimeType: 'image/jpeg',
      pageCount: 1,
      widthPixels: 2,
    });
  });

  it('parses and preserves a multi-page PDF page count', async () => {
    const source = await PDFDocument.create();
    source.addPage([300, 500]);
    source.addPage([500, 300]);
    source.addPage([400, 400]);
    const bytes = await source.save();

    await expect(new PdfLibAttachmentInspector().inspect(bytes)).resolves.toEqual({
      heightPixels: null,
      mimeType: 'application/pdf',
      pageCount: 3,
      widthPixels: null,
    });
  });

  it('rejects unsupported file signatures', async () => {
    await expect(
      new PdfLibAttachmentInspector().inspect(Uint8Array.from([0x47, 0x49, 0x46])),
    ).rejects.toBeInstanceOf(AttachmentInspectionError);
  });

  it('rejects damaged content even when its signature looks supported', async () => {
    await expect(
      new PdfLibAttachmentInspector().inspect(
        Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ),
    ).rejects.toMatchObject({
      message: 'The receipt image has an invalid PNG header.',
    });
  });

  it('rejects unsafe PNG dimensions before full image decoding', async () => {
    const unsafePng = onePixelPng.slice();
    unsafePng.set([0, 0, 0x75, 0x30], 16);

    await expect(new PdfLibAttachmentInspector().inspect(unsafePng)).rejects.toThrow(
      'Choose an image no wider or taller than 20000 pixels',
    );
  });

  it('rejects unsafe JPEG dimensions before full image decoding', async () => {
    const unsafeJpegHeader = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x64, 0x75, 0x30, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);

    await expect(new PdfLibAttachmentInspector().inspect(unsafeJpegHeader)).rejects.toThrow(
      'Choose an image no wider or taller than 20000 pixels',
    );
  });
});
