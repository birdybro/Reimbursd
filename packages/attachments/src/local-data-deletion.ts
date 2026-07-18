// SPDX-License-Identifier: GPL-3.0-only
import type { LocalDataDeletionRepository, LocalDataDeletionResult } from '@reimbursd/database';

import type { AttachmentCleanupFailure, ReceiptDeletionCoordinator } from './receipt-deletion.js';

export type LocalDataDeletionCoordinatorResult =
  | {
      readonly deleted: LocalDataDeletionResult;
      readonly status: 'completed';
    }
  | {
      readonly attachmentCleanupFailures: readonly AttachmentCleanupFailure[] | null;
      readonly status: 'cleanup_pending';
    };

export class LocalDataDeletionCoordinator {
  readonly #attachments: Pick<ReceiptDeletionCoordinator, 'cleanupPending'>;
  readonly #repository: LocalDataDeletionRepository;

  constructor(dependencies: {
    readonly attachments: Pick<ReceiptDeletionCoordinator, 'cleanupPending'>;
    readonly repository: LocalDataDeletionRepository;
  }) {
    this.#attachments = dependencies.attachments;
    this.#repository = dependencies.repository;
  }

  async deleteAll(requestedAt: string): Promise<LocalDataDeletionCoordinatorResult> {
    await this.#repository.begin(requestedAt);
    return this.#continuePending();
  }

  async resumePending(): Promise<LocalDataDeletionCoordinatorResult | null> {
    const pending = await this.#repository.getPending();

    if (pending === null) {
      return null;
    }

    return this.#continuePending();
  }

  async #continuePending(): Promise<LocalDataDeletionCoordinatorResult> {
    let attachmentCleanupFailures: readonly AttachmentCleanupFailure[];

    try {
      attachmentCleanupFailures = await this.#attachments.cleanupPending();
    } catch {
      return { attachmentCleanupFailures: null, status: 'cleanup_pending' };
    }

    if (attachmentCleanupFailures.length > 0) {
      return { attachmentCleanupFailures, status: 'cleanup_pending' };
    }

    try {
      return { deleted: await this.#repository.finalize(), status: 'completed' };
    } catch {
      return { attachmentCleanupFailures: null, status: 'cleanup_pending' };
    }
  }
}
