// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';

import { PlatformEncryptedBackupWriter } from '../local-encrypted-backup';

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

    create() {
      files.set(this.uri, new Uint8Array());
    }

    delete() {
      files.delete(this.uri);
    }

    write(contents: Uint8Array) {
      files.set(this.uri, Uint8Array.from(contents));
    }
  }

  return { __files: files, File: MockFile, Paths: { cache: 'private-cache' } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

const fileSystem = jest.requireMock('expo-file-system') as {
  __files: Map<string, Uint8Array>;
};
const sharing = jest.requireMock('expo-sharing') as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};
const file = {
  bytes: Uint8Array.from([82, 69, 73, 77]),
  filename: 'reimbursd-backup-2026-07-18.rbd',
};

describe('platform encrypted backup writer', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    fileSystem.__files.clear();
    sharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    sharing.shareAsync.mockReset().mockResolvedValue(undefined);
  });

  test('shares a native temporary backup and removes it after success or failure', async () => {
    const writer = new PlatformEncryptedBackupWriter();
    await writer.save(file);

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      'private-cache/reimbursd-backup-2026-07-18.rbd',
      {
        dialogTitle: 'Back up Reimbursd data',
        mimeType: 'application/x-reimbursd-backup',
        UTI: 'public.data',
      },
    );
    expect(fileSystem.__files.size).toBe(0);

    sharing.shareAsync.mockRejectedValue(new Error('synthetic share failure'));
    await expect(writer.save(file)).rejects.toThrow('synthetic share failure');
    expect(fileSystem.__files.size).toBe(0);
  });

  test('downloads a browser backup without writing to native storage', async () => {
    Platform.OS = 'web';
    const click = jest.fn();
    const remove = jest.fn();
    const link = { click, download: '', href: '', remove, style: { display: '' } };
    const append = jest.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: { appendChild: append }, createElement: jest.fn(() => link) },
    });
    const createObjectURL = jest.fn(() => 'blob:local-encrypted-backup');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await new PlatformEncryptedBackupWriter().save(file);

    expect(link.download).toBe(file.filename);
    expect(link.href).toBe('blob:local-encrypted-backup');
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-encrypted-backup');
    expect(sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  test('rejects path-like filenames before writing', async () => {
    await expect(
      new PlatformEncryptedBackupWriter().save({ ...file, filename: '../backup.rbd' }),
    ).rejects.toThrow('Encrypted backup filename is invalid.');
    expect(fileSystem.__files.size).toBe(0);
  });
});
