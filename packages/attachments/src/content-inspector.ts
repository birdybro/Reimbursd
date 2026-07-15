// SPDX-License-Identifier: GPL-3.0-only
/// <reference path="./pdf-lib-esm.d.ts" />
import { PDFDocument } from 'pdf-lib/dist/pdf-lib.esm.js';

import type { ReceiptDocumentMimeType } from '@reimbursd/domain';

export interface AttachmentInspection {
  readonly heightPixels: number | null;
  readonly mimeType: ReceiptDocumentMimeType;
  readonly pageCount: number;
  readonly widthPixels: number | null;
}

export interface AttachmentInspector {
  inspect(bytes: Uint8Array): Promise<AttachmentInspection>;
}

export class AttachmentInspectionError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'AttachmentInspectionError';
  }
}

export class PdfLibAttachmentInspector implements AttachmentInspector {
  async inspect(bytes: Uint8Array): Promise<AttachmentInspection> {
    if (hasPrefix(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
      return inspectPdf(bytes);
    }

    if (hasPrefix(bytes, [0xff, 0xd8, 0xff])) {
      return inspectImage(bytes, 'image/jpeg');
    }

    if (hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
      return inspectImage(bytes, 'image/png');
    }

    throw new AttachmentInspectionError(
      'Choose a valid JPEG, PNG, or PDF receipt. The file contents do not match a supported format.',
    );
  }
}

async function inspectImage(
  bytes: Uint8Array,
  mimeType: 'image/jpeg' | 'image/png',
): Promise<AttachmentInspection> {
  const probedDimensions =
    mimeType === 'image/jpeg' ? probeJpegDimensions(bytes) : probePngDimensions(bytes);
  assertSafeImageDimensions(probedDimensions);

  try {
    const document = await PDFDocument.create();
    const image =
      mimeType === 'image/jpeg' ? await document.embedJpg(bytes) : await document.embedPng(bytes);

    if (image.width !== probedDimensions.width || image.height !== probedDimensions.height) {
      throw new Error('Decoded dimensions do not match the image header.');
    }

    return {
      heightPixels: image.height,
      mimeType,
      pageCount: 1,
      widthPixels: image.width,
    };
  } catch (error) {
    throw new AttachmentInspectionError(
      'The receipt image is damaged or uses an unsupported encoding.',
      { cause: error },
    );
  }
}

interface ImageDimensions {
  readonly height: number;
  readonly width: number;
}

function assertSafeImageDimensions(dimensions: ImageDimensions): void {
  const maximumDimension = 20_000;
  const maximumPixels = 100_000_000;

  if (
    dimensions.width <= 0 ||
    dimensions.height <= 0 ||
    dimensions.width > maximumDimension ||
    dimensions.height > maximumDimension ||
    dimensions.width * dimensions.height > maximumPixels
  ) {
    throw new AttachmentInspectionError(
      `Choose an image no wider or taller than ${maximumDimension} pixels and containing no more than ${maximumPixels} pixels.`,
    );
  }
}

function probePngDimensions(bytes: Uint8Array): ImageDimensions {
  if (bytes.byteLength < 24 || !hasPrefix(bytes.slice(12), [0x49, 0x48, 0x44, 0x52])) {
    throw new AttachmentInspectionError('The receipt image has an invalid PNG header.');
  }

  return {
    height: readUnsigned32(bytes, 20),
    width: readUnsigned32(bytes, 16),
  };
}

function probeJpegDimensions(bytes: Uint8Array): ImageDimensions {
  const startOfFrameMarkers = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;

  while (offset < bytes.byteLength) {
    while (bytes[offset] === 0xff) {
      offset += 1;
    }

    const marker = bytes[offset];

    if (marker === undefined || marker === 0xda || marker === 0xd9) {
      break;
    }

    if (marker === 0x00 || marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 1;
      continue;
    }

    if (offset + 2 >= bytes.byteLength) {
      break;
    }

    const segmentLength = readUnsigned16(bytes, offset + 1);

    if (segmentLength < 2 || offset + segmentLength >= bytes.byteLength) {
      break;
    }

    if (startOfFrameMarkers.has(marker)) {
      if (segmentLength < 7) {
        break;
      }

      return {
        height: readUnsigned16(bytes, offset + 4),
        width: readUnsigned16(bytes, offset + 6),
      };
    }

    offset += segmentLength + 1;
  }

  throw new AttachmentInspectionError('The receipt image has an invalid JPEG header.');
}

function readUnsigned16(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) * 0x100 + (bytes[offset + 1] ?? 0);
}

function readUnsigned32(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    (bytes[offset + 1] ?? 0) * 0x10000 +
    (bytes[offset + 2] ?? 0) * 0x100 +
    (bytes[offset + 3] ?? 0)
  );
}

async function inspectPdf(bytes: Uint8Array): Promise<AttachmentInspection> {
  try {
    const document = await PDFDocument.load(bytes, { updateMetadata: false });
    const pageCount = document.getPageCount();

    if (pageCount < 1) {
      throw new Error('PDF contains no pages.');
    }

    return {
      heightPixels: null,
      mimeType: 'application/pdf',
      pageCount,
      widthPixels: null,
    };
  } catch (error) {
    throw new AttachmentInspectionError(
      'The receipt PDF is damaged, encrypted, or uses an unsupported encoding.',
      { cause: error },
    );
  }
}

function hasPrefix(bytes: Uint8Array, prefix: readonly number[]): boolean {
  return prefix.every((value, index) => bytes[index] === value);
}
