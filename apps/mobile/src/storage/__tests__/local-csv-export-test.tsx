// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';

import { PlatformCsvExportWriter } from '../local-csv-export';

jest.mock('expo-file-system', () => {
  const files = new Map<string, string>();

  class MockFile {
    readonly uri: string;

    constructor(...segments: unknown[]) {
      this.uri = segments.map(String).join('/');
    }

    get exists() {
      return files.has(this.uri);
    }

    create() {
      files.set(this.uri, '');
    }

    delete() {
      files.delete(this.uri);
    }

    write(contents: string) {
      files.set(this.uri, contents);
    }
  }

  return { __files: files, File: MockFile, Paths: { cache: 'private-cache' } };
});

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

const fileSystem = jest.requireMock('expo-file-system') as { __files: Map<string, string> };
const sharing = jest.requireMock('expo-sharing') as {
  isAvailableAsync: jest.Mock;
  shareAsync: jest.Mock;
};
const file = {
  contents: 'receipt_id,total\r\n11111111-1111-4111-8111-111111111111,12.34\r\n',
  filename: 'reimbursd-expenses-2026-07-17.csv',
};

describe('platform CSV export writer', () => {
  beforeEach(() => {
    Platform.OS = 'ios';
    fileSystem.__files.clear();
    sharing.isAvailableAsync.mockReset().mockResolvedValue(true);
    sharing.shareAsync.mockReset().mockResolvedValue(undefined);
  });

  test('shares a native temporary CSV and removes it afterward', async () => {
    await new PlatformCsvExportWriter().save(file);

    expect(sharing.shareAsync).toHaveBeenCalledWith(
      'private-cache/reimbursd-expenses-2026-07-17.csv',
      {
        dialogTitle: 'Export Reimbursd expenses',
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      },
    );
    expect(fileSystem.__files.size).toBe(0);
  });

  test('removes the native temporary CSV when sharing fails', async () => {
    sharing.shareAsync.mockRejectedValue(new Error('synthetic share failure'));

    await expect(new PlatformCsvExportWriter().save(file)).rejects.toThrow(
      'synthetic share failure',
    );
    expect(fileSystem.__files.size).toBe(0);
  });

  test('downloads a browser CSV without writing to native storage', async () => {
    Platform.OS = 'web';
    const click = jest.fn();
    const remove = jest.fn();
    const link = { click, download: '', href: '', remove, style: { display: '' } };
    const append = jest.fn();
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { body: { appendChild: append }, createElement: jest.fn(() => link) },
    });
    const createObjectURL = jest.fn(() => 'blob:local-csv-export');
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });

    await new PlatformCsvExportWriter().save(file);

    expect(link.download).toBe(file.filename);
    expect(link.href).toBe('blob:local-csv-export');
    expect(append).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:local-csv-export');
    expect(sharing.isAvailableAsync).not.toHaveBeenCalled();
  });

  test('rejects path-like filenames before writing', async () => {
    await expect(
      new PlatformCsvExportWriter().save({ ...file, filename: '../expenses.csv' }),
    ).rejects.toThrow('CSV export filename is invalid.');
    expect(fileSystem.__files.size).toBe(0);
  });
});
