// SPDX-License-Identifier: GPL-3.0-only
import { manipulateAsync, SaveFormat, type Action } from 'expo-image-manipulator';

import {
  defaultAttachmentPreviewLimits,
  type AttachmentPreviewWriter,
} from '@reimbursd/attachments';
import type { ReceiptDocument } from '@reimbursd/domain';

import { readPickedLocalFile, releaseTemporaryLocalFile } from '../../storage/local-attachments';
import type { ReceiptPreviewCreator } from './receipt-capture';

export class ExpoReceiptPreviewCreator implements ReceiptPreviewCreator {
  readonly #writer: Pick<AttachmentPreviewWriter, 'write'>;

  constructor(writer: Pick<AttachmentPreviewWriter, 'write'>) {
    this.#writer = writer;
  }

  async create(input: {
    readonly createdAt: string;
    readonly documentId: string;
    readonly original: ReceiptDocument;
    readonly sourceUri: string;
  }): Promise<ReceiptDocument> {
    const { heightPixels, mimeType, widthPixels } = input.original;

    if (mimeType === 'application/pdf' || widthPixels === null || heightPixels === null) {
      throw new TypeError('A local preview requires an original image.');
    }

    const result = await manipulateAsync(
      input.sourceUri,
      [createResizeAction(widthPixels, heightPixels)],
      {
        compress: 0.82,
        format: mimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG,
      },
    );

    try {
      return await this.#writer.write({
        bytes: await readPickedLocalFile({ uri: result.uri }),
        createdAt: input.createdAt,
        documentId: input.documentId,
        original: input.original,
      });
    } finally {
      if (result.uri !== input.sourceUri) {
        releaseTemporaryLocalFile(result.uri);
      }
    }
  }
}

function createResizeAction(widthPixels: number, heightPixels: number): Action {
  const maximumDimension = defaultAttachmentPreviewLimits.maximumDimension;

  return widthPixels >= heightPixels
    ? { resize: { width: Math.min(widthPixels, maximumDimension) } }
    : { resize: { height: Math.min(heightPixels, maximumDimension) } };
}
