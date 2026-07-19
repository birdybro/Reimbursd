// SPDX-License-Identifier: GPL-3.0-only
import type { Receipt } from '@reimbursd/domain';

export interface HostedReceiptRepository {
  create(ownerId: string, receipt: Receipt): Promise<Receipt>;
  getByIdForOwner(ownerId: string, receiptId: string): Promise<Receipt | null>;
}

export class HostedReceiptAlreadyExistsError extends Error {
  constructor() {
    super('A receipt with this ID already exists.');
    this.name = 'HostedReceiptAlreadyExistsError';
  }
}
