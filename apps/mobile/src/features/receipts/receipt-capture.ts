// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';

import {
  AttachmentDuplicateError,
  AttachmentInspectionError,
  AttachmentLimitError,
  defaultAttachmentLimits,
  type AttachmentIngestor,
} from '@reimbursd/attachments';
import type { ReceiptRepository } from '@reimbursd/database';
import {
  createManualReceipt,
  localDateToOffsetDateTime,
  type Receipt,
  type ReceiptDocument,
} from '@reimbursd/domain';

import { readPickedLocalFile } from '../../storage/local-attachments';
import type { SelectedReceiptFile } from './receipt-pickers';

export interface ImportedReceipt {
  readonly document: ReceiptDocument;
  readonly preview: ReceiptDocument | null;
  readonly previewFailed: boolean;
  readonly receipt: Receipt;
}

export interface ReceiptPreviewCreator {
  create(input: {
    readonly createdAt: string;
    readonly documentId: string;
    readonly original: ReceiptDocument;
    readonly sourceUri: string;
  }): Promise<ReceiptDocument>;
}

export class ReceiptCaptureCoordinator {
  readonly #ingestor: Pick<AttachmentIngestor, 'ingestOriginal'>;
  readonly #previewer: ReceiptPreviewCreator;
  readonly #receipts: ReceiptRepository;

  constructor(dependencies: {
    readonly ingestor: Pick<AttachmentIngestor, 'ingestOriginal'>;
    readonly previewer: ReceiptPreviewCreator;
    readonly receipts: ReceiptRepository;
  }) {
    this.#ingestor = dependencies.ingestor;
    this.#previewer = dependencies.previewer;
    this.#receipts = dependencies.receipts;
  }

  async import(selection: SelectedReceiptFile): Promise<ImportedReceipt> {
    validateReportedSize(selection.reportedByteSize);
    validateOriginalFilename(selection.originalFilename);
    const bytes = await readPickedLocalFile(selection);
    const capturedAt = new Date();
    const receipt = createPendingReceipt(capturedAt);
    await this.#receipts.create(receipt);

    let document: ReceiptDocument;

    try {
      document = await this.#ingestor.ingestOriginal({
        bytes,
        createdAt: capturedAt.toISOString(),
        documentId: randomUUID(),
        originalFilename: selection.originalFilename,
        receiptId: receipt.id,
        sourceType: selection.sourceType,
      });
    } catch (error) {
      try {
        await this.#receipts.delete(receipt.id, receipt.version, new Date().toISOString());
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Receipt import failed and its empty local record could not be cleaned up.',
        );
      }

      throw error;
    }

    if (document.mimeType === 'application/pdf') {
      return { document, preview: null, previewFailed: false, receipt };
    }

    try {
      const preview = await this.#previewer.create({
        createdAt: new Date().toISOString(),
        documentId: randomUUID(),
        original: document,
        sourceUri: selection.uri,
      });

      return { document, preview, previewFailed: false, receipt };
    } catch {
      return { document, preview: null, previewFailed: true, receipt };
    }
  }
}

export function getReceiptImportErrorMessage(error: unknown): string {
  if (error instanceof AttachmentDuplicateError) {
    return 'This receipt file was already imported. Open the existing expense instead.';
  }

  if (error instanceof AttachmentLimitError) {
    return error.message;
  }

  if (error instanceof AttachmentInspectionError) {
    return error.message;
  }

  if (error instanceof Error && error.message.startsWith('The receipt ')) {
    return error.message;
  }

  return 'The receipt could not be imported. The original file was not added; try another file.';
}

function createPendingReceipt(capturedAt: Date): Receipt {
  const localDate = [
    capturedAt.getFullYear().toString().padStart(4, '0'),
    (capturedAt.getMonth() + 1).toString().padStart(2, '0'),
    capturedAt.getDate().toString().padStart(2, '0'),
  ].join('-');

  return createManualReceipt({
    capturedAt: capturedAt.toISOString(),
    currencyCode: 'USD',
    id: randomUUID(),
    merchantId: randomUUID(),
    merchantName: 'Receipt to review',
    purchasedAt: localDateToOffsetDateTime(localDate, capturedAt.getTimezoneOffset()),
    subtotalMinor: 0,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor: 0,
  });
}

function validateOriginalFilename(filename: string): void {
  if (filename.length === 0 || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new Error('The receipt filename is invalid. Rename the file and try again.');
  }
}

function validateReportedSize(reportedByteSize: number | undefined): void {
  if (
    reportedByteSize !== undefined &&
    (!Number.isSafeInteger(reportedByteSize) ||
      reportedByteSize <= 0 ||
      reportedByteSize > defaultAttachmentLimits.maximumByteSize)
  ) {
    throw new AttachmentLimitError(
      'maximumByteSize',
      `Choose a receipt file between 1 byte and ${defaultAttachmentLimits.maximumByteSize} bytes.`,
    );
  }
}
