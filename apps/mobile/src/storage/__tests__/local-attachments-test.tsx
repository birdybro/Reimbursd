// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';

import { LocalAttachmentStorage } from '../local-attachments';

jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(),
}));

jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();

  class MockFile {
    readonly uri: string;

    constructor(...segments: unknown[]) {
      this.uri = segments.map(String).join('/');
    }

    get exists() {
      return files.has(this.uri);
    }

    bytes() {
      const bytes = files.get(this.uri);

      if (bytes === undefined) {
        throw new Error('Synthetic file not found.');
      }

      return Promise.resolve(bytes.slice());
    }

    create() {
      files.set(this.uri, new Uint8Array());
    }

    delete() {
      files.delete(this.uri);
    }

    write(bytes: Uint8Array) {
      files.set(this.uri, bytes.slice());
    }
  }

  return {
    __files: files,
    File: MockFile,
    Paths: { document: 'private-documents' },
  };
});

const fileSystem = jest.requireMock('expo-file-system') as {
  __files: Map<string, Uint8Array>;
};
const receiptId = 'b1c535d8-7295-46ac-aa11-c09ea335e8f4';
const originalId = '0ad845cb-2616-46e2-9ea7-baf9c480e283';
const previewId = 'a187d7ba-99be-4b79-8f7f-a6cf86cd04cc';
const originalReference = `receipt-documents/${receiptId}/originals/${originalId}.jpg`;
const previewReference = `receipt-documents/${receiptId}/derivatives/${previewId}.jpg`;

describe('local attachment storage adapter', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    fileSystem.__files.clear();
  });

  test('writes native private files once, opens them, and deletes idempotently', async () => {
    const storage = new LocalAttachmentStorage();
    const bytes = Uint8Array.from([1, 2, 3]);

    await storage.writeOnce(previewReference, bytes);
    bytes.fill(9);

    const storedPath = `private-documents/${previewReference}`;
    expect(fileSystem.__files.get(storedPath)).toEqual(Uint8Array.from([1, 2, 3]));
    await expect(storage.writeOnce(previewReference, bytes)).rejects.toThrow(
      'Attachment storage reference already exists.',
    );
    await expect(storage.openForDisplay(previewReference)).resolves.toMatchObject({
      uri: storedPath,
    });
    await expect(storage.read(previewReference)).resolves.toEqual(Uint8Array.from([1, 2, 3]));

    await storage.delete(previewReference);
    await expect(storage.delete(previewReference)).resolves.toBeUndefined();
    expect(fileSystem.__files.has(storedPath)).toBe(false);
  });

  test('rejects traversal and PDF files in the derivative directory', async () => {
    const storage = new LocalAttachmentStorage();

    await expect(
      storage.writeOnce(
        `receipt-documents/${receiptId}/derivatives/${previewId}.pdf`,
        new Uint8Array([1]),
      ),
    ).rejects.toThrow('Attachment storage reference is invalid.');
    await expect(
      storage.writeOnce(`receipt-documents/${receiptId}/../${previewId}.jpg`, new Uint8Array([1])),
    ).rejects.toThrow('Attachment storage reference is invalid.');
  });

  test('uses origin-private browser storage and releases display object URLs', async () => {
    Platform.OS = 'web';
    const root = new MemoryDirectory();
    Object.defineProperty(navigator, 'storage', {
      configurable: true,
      value: { getDirectory: jest.fn(async () => root) },
    });
    const createObjectURL = jest.fn(() => 'blob:local-preview');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    const storage = new LocalAttachmentStorage();

    await storage.writeOnce(originalReference, Uint8Array.from([4, 5, 6]));
    await expect(storage.read(originalReference)).resolves.toEqual(Uint8Array.from([4, 5, 6]));
    const opened = await storage.openForDisplay(originalReference);

    expect(opened.uri).toBe('blob:local-preview');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    opened.release();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-preview');

    await storage.delete(originalReference);
    await expect(storage.delete(originalReference)).resolves.toBeUndefined();
  });
});

class MemoryDirectory {
  readonly #directories = new Map<string, MemoryDirectory>();
  readonly #files = new Map<string, Uint8Array>();

  async getDirectoryHandle(name: string, options?: { readonly create?: boolean }) {
    const existing = this.#directories.get(name);

    if (existing !== undefined) {
      return existing;
    }

    if (!options?.create) {
      throw notFoundError();
    }

    const directory = new MemoryDirectory();
    this.#directories.set(name, directory);
    return directory;
  }

  async getFileHandle(name: string, options?: { readonly create?: boolean }) {
    if (!this.#files.has(name) && !options?.create) {
      throw notFoundError();
    }

    if (!this.#files.has(name)) {
      this.#files.set(name, new Uint8Array());
    }

    return {
      createWritable: async () => ({
        abort: async () => undefined,
        close: async () => undefined,
        write: async (bytes: ArrayBuffer) => {
          this.#files.set(name, new Uint8Array(bytes).slice());
        },
      }),
      getFile: async () => {
        const stored = this.#files.get(name) ?? new Uint8Array();
        const copy = new ArrayBuffer(stored.byteLength);
        new Uint8Array(copy).set(stored);
        return new Blob([copy]);
      },
    };
  }

  async removeEntry(name: string) {
    if (!this.#files.delete(name)) {
      throw notFoundError();
    }
  }
}

function notFoundError(): DOMException {
  return new DOMException('Synthetic file not found.', 'NotFoundError');
}
