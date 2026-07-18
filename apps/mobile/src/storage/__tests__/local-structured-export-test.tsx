// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';

import { PlatformStructuredExportWriter } from '../local-structured-export';

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
  bytes: Uint8Array.from([80, 75, 3, 4]),
  filename: 'reimbursd-export-2026-07-18.zip',
};

describe('platform structured export writer', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    fileSystem.__files.clear();
    sharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    sharing.shareAsync.mockReset().mockResolvedValue(undefined);
  });

  test('shares a native temporary ZIP and removes it afterward', async () => {
    await new PlatformStructuredExportWriter().save(file);

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      'private-cache/reimbursd-export-2026-07-18.zip',
      {
        dialogTitle: 'Export Reimbursd data',
        mimeType: 'application/zip',
        UTI: 'public.zip-archive',
      },
    );
    expect(fileSystem.__files.size).toBe(0);
  });

  test('removes the native temporary ZIP when sharing fails', async () => {
    sharing.shareAsync.mockRejectedValue(new Error('synthetic share failure'));

    await expect(new PlatformStructuredExportWriter().save(file)).rejects.toThrow(
      'synthetic share failure',
    );
    expect(fileSystem.__files.size).toBe(0);
  });

  test('downloads a browser ZIP without writing to native storage', async () => {
    Platform.OS = 'web';
    const click = jest.fn();
    const remove = jest.fn();
    const link = { click, download: '', href: '', remove, style: { display: '' } };
    const append = jest.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: { appendChild: append }, createElement: jest.fn(() => link) },
    });
    const createObjectURL = jest.fn(() => 'blob:local-structured-export');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await new PlatformStructuredExportWriter().save(file);

    expect(link.download).toBe(file.filename);
    expect(link.href).toBe('blob:local-structured-export');
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-structured-export');
    expect(sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  test('rejects path-like filenames before writing', async () => {
    await expect(
      new PlatformStructuredExportWriter().save({ ...file, filename: '../export.zip' }),
    ).rejects.toThrow('Structured export filename is invalid.');
    expect(fileSystem.__files.size).toBe(0);
  });
});
