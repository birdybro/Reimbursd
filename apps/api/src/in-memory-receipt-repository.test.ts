// SPDX-License-Identifier: GPL-3.0-only
import { createManualReceipt } from '@reimbursd/domain';
import { describe, expect, it } from 'vitest';
import { InMemoryHostedReceiptRepository } from './in-memory-receipt-repository.js';
import { HostedReceiptAlreadyExistsError } from './receipt-repository.js';

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const receipt = createManualReceipt({
  capturedAt: '2026-07-18T12:00:00-06:00',
  currencyCode: 'USD',
  id: '10000000-0000-4000-8000-000000000001',
  merchantId: '20000000-0000-4000-8000-000000000001',
  merchantName: 'Synthetic Merchant',
  purchasedAt: '2026-07-18T11:30:00-06:00',
  subtotalMinor: 1_000,
  taxMinor: 80,
  tipMinor: 200,
  totalMinor: 1_280,
});

describe('InMemoryHostedReceiptRepository', () => {
  it('requires the matching owner for reads', async () => {
    const repository = new InMemoryHostedReceiptRepository();
    await repository.create(ownerA, receipt);

    await expect(repository.getByIdForOwner(ownerA, receipt.id)).resolves.toEqual(receipt);
    await expect(repository.getByIdForOwner(ownerB, receipt.id)).resolves.toBeNull();
    await expect(repository.listForOwner(ownerA, 100)).resolves.toEqual([receipt]);
    await expect(repository.listForOwner(ownerB, 100)).resolves.toEqual([]);
  });

  it('orders and bounds owner lists without returning mutable records', async () => {
    const repository = new InMemoryHostedReceiptRepository();
    const newer = createManualReceipt({
      capturedAt: '2026-07-19T12:00:00-06:00',
      currencyCode: 'USD',
      id: '10000000-0000-4000-8000-000000000002',
      merchantId: '20000000-0000-4000-8000-000000000002',
      merchantName: 'Newer Synthetic Merchant',
      purchasedAt: '2026-07-19T11:30:00-06:00',
      subtotalMinor: 500,
      taxMinor: 40,
      tipMinor: 0,
      totalMinor: 540,
    });
    await repository.create(ownerA, receipt);
    await repository.create(ownerA, newer);
    const listed = await repository.listForOwner(ownerA, 1);

    expect(listed).toEqual([newer]);
    await expect(repository.listForOwner(ownerA, 101)).rejects.toThrow(
      'Hosted receipt list maximum must be between 1 and 100.',
    );
  });

  it('rejects globally duplicate receipt IDs', async () => {
    const repository = new InMemoryHostedReceiptRepository();
    await repository.create(ownerA, receipt);

    await expect(repository.create(ownerB, receipt)).rejects.toBeInstanceOf(
      HostedReceiptAlreadyExistsError,
    );
  });

  it('does not expose mutable storage references', async () => {
    const repository = new InMemoryHostedReceiptRepository();
    const saved = await repository.create(ownerA, receipt);
    const changed = { ...saved, merchantName: 'Changed outside repository' };

    expect(changed.merchantName).not.toBe(receipt.merchantName);
    await expect(repository.getByIdForOwner(ownerA, receipt.id)).resolves.toEqual(receipt);
  });
});
