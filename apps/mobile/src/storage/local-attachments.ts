// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';
import { CryptoDigestAlgorithm, digest } from 'expo-crypto';
import { File as ExpoFile, Paths } from 'expo-file-system';

import type { AttachmentHasher, AttachmentStorage } from '@reimbursd/attachments';
import { isUuid } from '@reimbursd/domain';

export interface PickedLocalFile {
  readonly file?: Blob;
  readonly uri: string;
}

export class LocalAttachmentStorage implements AttachmentStorage {
  async delete(storageReference: string): Promise<void> {
    const path = validateStorageReference(storageReference);

    if (Platform.OS === 'web') {
      await deleteWebFile(path);
      return;
    }

    const file = new ExpoFile(Paths.document, ...path);

    if (file.exists) {
      file.delete();
    }
  }

  async writeOnce(storageReference: string, bytes: Uint8Array): Promise<void> {
    const path = validateStorageReference(storageReference);

    if (Platform.OS === 'web') {
      await writeWebFileOnce(path, bytes);
      return;
    }

    const file = new ExpoFile(Paths.document, ...path);

    if (file.exists) {
      throw new Error('Attachment storage reference already exists.');
    }

    file.create({ intermediates: true, overwrite: false });

    try {
      file.write(bytes);
    } catch (error) {
      try {
        if (file.exists) {
          file.delete();
        }
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Attachment write and cleanup both failed.',
        );
      }

      throw error;
    }
  }
}

export class ExpoAttachmentHasher implements AttachmentHasher {
  async sha256(bytes: Uint8Array): Promise<string> {
    const ownedBytes = Uint8Array.from(bytes);
    const result = await digest(CryptoDigestAlgorithm.SHA256, ownedBytes.buffer);

    return Array.from(new Uint8Array(result), (byte) => byte.toString(16).padStart(2, '0')).join(
      '',
    );
  }
}

export async function readPickedLocalFile(asset: PickedLocalFile): Promise<Uint8Array> {
  if (Platform.OS === 'web') {
    if (asset.file !== undefined) {
      return new Uint8Array(await asset.file.arrayBuffer());
    }

    const response = await fetch(asset.uri);

    if (!response.ok) {
      throw new Error('The selected local file could not be read.');
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  return new ExpoFile(asset.uri).bytes();
}

function validateStorageReference(storageReference: string): readonly string[] {
  const path = storageReference.split('/');
  const [root, receiptId, originalDirectory, filename] = path;
  const filenameMatch = /^([0-9a-f-]+)\.(jpg|pdf|png)$/i.exec(filename ?? '');

  if (
    path.length !== 4 ||
    root !== 'receipt-documents' ||
    originalDirectory !== 'originals' ||
    receiptId === undefined ||
    !isUuid(receiptId) ||
    filenameMatch === null ||
    !isUuid(filenameMatch[1] ?? '')
  ) {
    throw new Error('Attachment storage reference is invalid.');
  }

  return path;
}

async function deleteWebFile(path: readonly string[]): Promise<void> {
  const { directory, filename } = await getWebParentDirectory(path);

  try {
    await directory.removeEntry(filename);
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }
}

async function writeWebFileOnce(path: readonly string[], bytes: Uint8Array): Promise<void> {
  const { directory, filename } = await getWebParentDirectory(path);

  try {
    await directory.getFileHandle(filename);
    throw new Error('Attachment storage reference already exists.');
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }
  }

  const handle = await directory.getFileHandle(filename, { create: true });
  const writable = await handle.createWritable();

  try {
    await writable.write(Uint8Array.from(bytes).buffer);
    await writable.close();
  } catch (error) {
    const cleanupErrors: unknown[] = [];

    try {
      await writable.abort();
    } catch (abortError) {
      cleanupErrors.push(abortError);
    }

    try {
      await directory.removeEntry(filename);
    } catch (cleanupError) {
      cleanupErrors.push(cleanupError);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'Attachment write and cleanup both failed.',
      );
    }

    throw error;
  }
}

async function getWebParentDirectory(
  path: readonly string[],
): Promise<{ readonly directory: FileSystemDirectoryHandle; readonly filename: string }> {
  if (navigator.storage.getDirectory === undefined) {
    throw new Error('Private browser file storage is unavailable.');
  }

  const filename = path.at(-1);

  if (filename === undefined) {
    throw new Error('Attachment storage reference has no filename.');
  }

  let directory = await navigator.storage.getDirectory();

  for (const segment of path.slice(0, -1)) {
    directory = await directory.getDirectoryHandle(segment, { create: true });
  }

  return { directory, filename };
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotFoundError';
}
