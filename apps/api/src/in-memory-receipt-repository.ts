// SPDX-License-Identifier: GPL-3.0-only
import { isUuid, type Receipt } from '@reimbursd/domain';
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
    assertOwnerId(ownerId);

    if (this.#receipts.has(receipt.id)) {
      throw new HostedReceiptAlreadyExistsError();
    }

    const storedReceipt = { ...receipt };
    this.#receipts.set(receipt.id, { ownerId, receipt: storedReceipt });
    return { ...storedReceipt };
  }

  async getByIdForOwner(ownerId: string, receiptId: string): Promise<Receipt | null> {
    assertOwnerId(ownerId);
    const stored = this.#receipts.get(receiptId);

    if (!stored || stored.ownerId !== ownerId) {
      return null;
    }

    return { ...stored.receipt };
  }

  async listForOwner(ownerId: string, maximum: number): Promise<readonly Receipt[]> {
    assertOwnerId(ownerId);
    assertMaximum(maximum);
    return [...this.#receipts.values()]
      .filter((stored) => stored.ownerId === ownerId && stored.receipt.deletedAt === null)
      .map(({ receipt }) => ({ ...receipt }))
      .sort(compareReceipts)
      .slice(0, maximum);
  }
}

function compareReceipts(left: Receipt, right: Receipt): number {
  return (
    right.purchasedAt.localeCompare(left.purchasedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  );
}

function assertOwnerId(ownerId: string): void {
  if (!isUuid(ownerId)) {
    throw new TypeError('Owner ID must be a UUID.');
  }
}

function assertMaximum(maximum: number): void {
  if (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 100) {
    throw new RangeError('Hosted receipt list maximum must be between 1 and 100.');
  }
}
