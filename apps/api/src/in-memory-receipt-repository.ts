// SPDX-License-Identifier: GPL-3.0-only
import type { Receipt } from '@reimbursd/domain';
import {
  HostedReceiptAlreadyExistsError,
  type HostedReceiptRepository,
} from './receipt-repository.js';

interface StoredReceipt {
  readonly ownerId: string;
  readonly receipt: Receipt;
}

export class InMemoryHostedReceiptRepository implements HostedReceiptRepository {
  readonly #receipts = new Map<string, StoredReceipt>();

  async create(ownerId: string, receipt: Receipt): Promise<Receipt> {
    if (this.#receipts.has(receipt.id)) {
      throw new HostedReceiptAlreadyExistsError();
    }

    const storedReceipt = { ...receipt };
    this.#receipts.set(receipt.id, { ownerId, receipt: storedReceipt });
    return { ...storedReceipt };
  }

  async getByIdForOwner(ownerId: string, receiptId: string): Promise<Receipt | null> {
    const stored = this.#receipts.get(receiptId);

    if (!stored || stored.ownerId !== ownerId) {
      return null;
    }

    return { ...stored.receipt };
  }
}
