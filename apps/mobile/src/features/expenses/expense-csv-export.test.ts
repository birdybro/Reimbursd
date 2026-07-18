// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptRepository } from '@reimbursd/database';
import { createManualReceipt } from '@reimbursd/domain';
import { describe, expect, it, vi } from 'vitest';

import { exportExpenseCsv, type CsvExportWriter } from './expense-csv-export.js';

const receipt = createManualReceipt({
  capturedAt: '2026-07-17T12:05:00-06:00',
  currencyCode: 'USD',
  id: '11111111-1111-4111-8111-111111111111',
  merchantId: '22222222-2222-4222-8222-222222222222',
  merchantName: 'Synthetic Market',
  purchasedAt: '2026-07-17T12:00:00-06:00',
  subtotalMinor: 1_234,
  taxMinor: 0,
  tipMinor: 0,
  totalMinor: 1_234,
});

describe('local expense CSV export coordinator', () => {
  it('reads all active receipts and writes a dated CSV file', async () => {
    const repository = createRepository();
    const writer: CsvExportWriter = { save: vi.fn().mockResolvedValue(undefined) };

    await expect(
      exportExpenseCsv({
        now: () => new Date('2026-07-17T18:00:00.000Z'),
        repository,
        writer,
      }),
    ).resolves.toEqual({ filename: 'reimbursd-expenses-2026-07-17.csv', receiptCount: 1 });
    expect(repository.list).toHaveBeenCalledWith();
    expect(writer.save).toHaveBeenCalledWith({
      contents: expect.stringContaining(`${receipt.id},${receipt.merchantId},Synthetic Market`),
      filename: 'reimbursd-expenses-2026-07-17.csv',
    });
  });

  it('does not report success when the platform writer fails', async () => {
    const writer: CsvExportWriter = {
      save: vi.fn().mockRejectedValue(new Error('synthetic write failure')),
    };

    await expect(exportExpenseCsv({ repository: createRepository(), writer })).rejects.toThrow(
      'synthetic write failure',
    );
  });
});

function createRepository(): ReceiptRepository {
  return {
    create: vi.fn(),
    delete: vi.fn(),
    getById: vi.fn(),
    list: vi.fn().mockResolvedValue([receipt]),
    update: vi.fn(),
  };
}
