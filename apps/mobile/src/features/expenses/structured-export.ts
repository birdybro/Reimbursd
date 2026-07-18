// SPDX-License-Identifier: GPL-3.0-only
import type { StructuredExportSnapshotRepository } from '@reimbursd/database';
import { createStructuredExport, type StructuredExportHasher } from '@reimbursd/export';

export interface StructuredExportFile {
  readonly bytes: Uint8Array;
  readonly filename: string;
}

export interface StructuredExportWriter {
  save(file: StructuredExportFile): Promise<void>;
}

export interface StructuredExportAttachmentStorage {
  read(storageReference: string): Promise<Uint8Array>;
}

export interface StructuredExportResult {
  readonly attachmentCount: number;
  readonly filename: string;
  readonly receiptCount: number;
}

export async function exportStructuredData({
  applicationVersion,
  hasher,
  includeOriginalAttachments,
  now = () => new Date(),
  repository,
  schemaVersion,
  storage,
  writer,
}: {
  readonly applicationVersion: string;
  readonly hasher: StructuredExportHasher;
  readonly includeOriginalAttachments: boolean;
  readonly now?: () => Date;
  readonly repository: StructuredExportSnapshotRepository;
  readonly schemaVersion: number;
  readonly storage: StructuredExportAttachmentStorage;
  readonly writer: StructuredExportWriter;
}): Promise<StructuredExportResult> {
  const records = await repository.getActiveSnapshot();
  const originalDocuments = records.receiptDocuments.filter(({ isOriginal }) => isOriginal);
  const attachments = [];

  if (includeOriginalAttachments) {
    for (const document of originalDocuments) {
      attachments.push({
        bytes: await storage.read(document.storageReference),
        documentId: document.id,
      });
    }
  }

  const archive = await createStructuredExport({
    applicationVersion,
    attachments,
    createdAt: now().toISOString(),
    hasher,
    includeOriginalAttachments,
    records,
    schemaVersion,
  });
  await writer.save({ bytes: archive.bytes, filename: archive.filename });

  return {
    attachmentCount: attachments.length,
    filename: archive.filename,
    receiptCount: records.receipts.length,
  };
}
