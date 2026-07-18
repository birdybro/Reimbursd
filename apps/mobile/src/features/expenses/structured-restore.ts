// SPDX-License-Identifier: GPL-3.0-only
import {
  StructuredImportTargetNotEmptyError,
  type StructuredImportRepository,
  type StructuredImportResult,
} from '@reimbursd/database';
import {
  parseStructuredExport,
  StructuredExportValidationError,
  type StructuredExportHasher,
} from '@reimbursd/export';

export interface StructuredRestoreStorage {
  delete(storageReference: string): Promise<void>;
  read(storageReference: string): Promise<Uint8Array>;
  writeOnce(storageReference: string, bytes: Uint8Array): Promise<void>;
}

export class StructuredRestoreMissingAttachmentsError extends Error {
  constructor() {
    super('Restore requires an export that includes every original receipt file.');
    this.name = 'StructuredRestoreMissingAttachmentsError';
  }
}

export class StructuredRestoreStorageConflictError extends Error {
  constructor() {
    super('A local receipt file conflicts with the selected restore archive.');
    this.name = 'StructuredRestoreStorageConflictError';
  }
}

export function getStructuredRestoreErrorMessage(error: unknown): string {
  if (error instanceof StructuredImportTargetNotEmptyError) {
    return 'Restore requires an empty local database. Use a clean installation and try again.';
  }

  if (error instanceof StructuredRestoreMissingAttachmentsError) {
    return 'This export does not include every original receipt file. Choose a complete export with originals.';
  }

  if (error instanceof StructuredRestoreStorageConflictError) {
    return 'A local receipt file conflicts with this archive. Use a clean installation or retry the same interrupted restore.';
  }

  if (error instanceof StructuredExportValidationError) {
    return 'The selected file is not a valid supported Reimbursd export.';
  }

  if (error instanceof AggregateError) {
    return 'Restore failed and local file cleanup was incomplete. Retry with the same archive.';
  }

  return 'Restore could not be completed. No structured data was added; try again.';
}

export async function restoreStructuredData({
  bytes,
  compatibleSchemaVersions = [],
  hasher,
  repository,
  storage,
  supportedSchemaVersion,
}: {
  readonly bytes: Uint8Array;
  readonly compatibleSchemaVersions?: readonly number[];
  readonly hasher: StructuredExportHasher;
  readonly repository: StructuredImportRepository;
  readonly storage: StructuredRestoreStorage;
  readonly supportedSchemaVersion: number;
}): Promise<StructuredImportResult> {
  const parsed = await parseStructuredExport({
    bytes,
    compatibleSchemaVersions,
    hasher,
    supportedSchemaVersion,
  });
  const originalDocuments = parsed.records.receiptDocuments.filter(({ isOriginal }) => isOriginal);

  if (
    originalDocuments.length !== parsed.records.receiptDocuments.length ||
    originalDocuments.length !== parsed.attachments.length
  ) {
    throw new StructuredRestoreMissingAttachmentsError();
  }

  for (const document of originalDocuments) {
    if (document.storageReference !== expectedOriginalStorageReference(document)) {
      throw new StructuredExportValidationError(
        'Structured export receipt document storage reference is invalid for this application.',
      );
    }
  }

  const documentsById = new Map(
    originalDocuments.map((document) => [document.id, document] as const),
  );
  const createdReferences: string[] = [];

  try {
    for (const attachment of parsed.attachments) {
      const document = documentsById.get(attachment.documentId);

      if (document === undefined) {
        throw new StructuredRestoreMissingAttachmentsError();
      }

      try {
        await storage.writeOnce(document.storageReference, attachment.bytes);
        createdReferences.push(document.storageReference);
      } catch (writeError) {
        let existing: Uint8Array;

        try {
          existing = await storage.read(document.storageReference);
        } catch {
          throw writeError;
        }

        if (!bytesEqual(existing, attachment.bytes)) {
          throw new StructuredRestoreStorageConflictError();
        }
      }
    }

    return await repository.restoreClean(parsed.records);
  } catch (error) {
    const cleanupErrors: unknown[] = [];

    for (const storageReference of createdReferences.reverse()) {
      try {
        await storage.delete(storageReference);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Restore failed and at least one new receipt file could not be cleaned up.',
      );
    }

    throw error;
  }
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}

function expectedOriginalStorageReference({
  id,
  mimeType,
  receiptId,
}: {
  readonly id: string;
  readonly mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  readonly receiptId: string;
}): string {
  const extension =
    mimeType === 'application/pdf' ? 'pdf' : mimeType === 'image/png' ? 'png' : 'jpg';
  return `receipt-documents/${receiptId}/originals/${id}.${extension}`;
}
