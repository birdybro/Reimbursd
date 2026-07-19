// SPDX-License-Identifier: GPL-3.0-only
import type { StructuredExportSnapshotRepository } from '@reimbursd/database';
import {
  createStructuredExport,
  type StructuredExportArchive,
  type StructuredExportHasher,
} from '@reimbursd/export';

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

export interface PreparedStructuredExport extends StructuredExportResult {
  readonly archive: StructuredExportArchive;
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
  const prepared = await createStructuredDataArchive({
    applicationVersion,
    hasher,
    includeOriginalAttachments,
    now,
    repository,
    schemaVersion,
    storage,
  });
  await writer.save({ bytes: prepared.archive.bytes, filename: prepared.archive.filename });

  return {
    attachmentCount: prepared.attachmentCount,
    filename: prepared.filename,
    receiptCount: prepared.receiptCount,
  };
}

export async function createStructuredDataArchive({
  applicationVersion,
  hasher,
  includeOriginalAttachments,
  now = () => new Date(),
  repository,
  schemaVersion,
  storage,
}: {
  readonly applicationVersion: string;
  readonly hasher: StructuredExportHasher;
  readonly includeOriginalAttachments: boolean;
  readonly now?: () => Date;
  readonly repository: StructuredExportSnapshotRepository;
  readonly schemaVersion: number;
  readonly storage: StructuredExportAttachmentStorage;
}): Promise<PreparedStructuredExport> {
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

  return {
    archive,
    attachmentCount: attachments.length,
    filename: archive.filename,
    receiptCount: records.receipts.length,
  };
}
