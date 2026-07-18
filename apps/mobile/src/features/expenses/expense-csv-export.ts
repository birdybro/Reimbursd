// SPDX-License-Identifier: GPL-3.0-only
import type { ReceiptRepository } from '@reimbursd/database';
import { createExpenseCsv } from '@reimbursd/domain';

export interface CsvExportFile {
  readonly contents: string;
  readonly filename: string;
}

export interface CsvExportWriter {
  save(file: CsvExportFile): Promise<void>;
}

export interface ExpenseCsvExportResult {
  readonly filename: string;
  readonly receiptCount: number;
}

export async function exportExpenseCsv({
  now = () => new Date(),
  repository,
  writer,
}: {
  readonly now?: () => Date;
  readonly repository: ReceiptRepository;
  readonly writer: CsvExportWriter;
}): Promise<ExpenseCsvExportResult> {
  const receipts = await repository.list();
  const filename = `reimbursd-expenses-${now().toISOString().slice(0, 10)}.csv`;
  await writer.save({ contents: createExpenseCsv(receipts), filename });
  return { filename, receiptCount: receipts.length };
}
