// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptDocumentRepository, ReceiptRepository } from '@reimbursd/database';
import type { Receipt, ReceiptDocument } from '@reimbursd/domain';

import type { AttachmentStorage } from './attachment-ingestor.js';

export interface AttachmentCleanupFailure {
  readonly document: ReceiptDocument;
  readonly error: unknown;
}

export interface ReceiptDeletionResult {
  readonly attachmentCleanupFailures: readonly AttachmentCleanupFailure[];
  readonly receipt: Receipt;
}

export class ReceiptDeletionCoordinator {
  readonly #documents: ReceiptDocumentRepository;
  readonly #now: () => string;
  readonly #receipts: ReceiptRepository;
  readonly #storage: AttachmentStorage;

  constructor(dependencies: {
    readonly documents: ReceiptDocumentRepository;
    readonly now?: () => string;
    readonly receipts: ReceiptRepository;
    readonly storage: AttachmentStorage;
  }) {
    this.#documents = dependencies.documents;
    this.#now = dependencies.now ?? (() => new Date().toISOString());
    this.#receipts = dependencies.receipts;
    this.#storage = dependencies.storage;
  }

  async deleteReceipt(
    id: string,
    expectedVersion: number,
    deletedAt: string,
  ): Promise<ReceiptDeletionResult> {
    const documents = await this.#documents.listByReceiptId(id);
    const receipt = await this.#receipts.delete(id, expectedVersion, deletedAt);
    const attachmentCleanupFailures = await this.cleanupDocuments(documents);

    return { attachmentCleanupFailures, receipt };
  }

  async cleanupPending(): Promise<readonly AttachmentCleanupFailure[]> {
    const documents = await this.#documents.listPendingStorageDeletion();
    return this.cleanupDocuments(documents);
  }

  async cleanupDocuments(
    documents: readonly ReceiptDocument[],
  ): Promise<readonly AttachmentCleanupFailure[]> {
    const failures: AttachmentCleanupFailure[] = [];

    for (const document of documents) {
      if (document.storageDeletedAt !== null) {
        continue;
      }

      try {
        await this.#storage.delete(document.storageReference);
        await this.#documents.markStorageDeleted(document.id, this.#now());
      } catch (error) {
        failures.push({ document, error });
      }
    }

    return failures;
  }
}
