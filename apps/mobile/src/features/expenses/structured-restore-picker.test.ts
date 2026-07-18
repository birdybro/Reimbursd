// SPDX-License-Identifier: GPL-3.0-only
import { getDocumentAsync } from 'expo-document-picker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultStructuredExportParseLimits } from '@reimbursd/export';

import { selectStructuredExport } from './structured-restore-picker.js';

vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));

describe('structured restore picker', () => {
  beforeEach(() => {
    vi.mocked(getDocumentAsync).mockReset();
  });

  it('returns null when selection is canceled', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({ assets: null, canceled: true });

    await expect(selectStructuredExport()).resolves.toBeNull();
  });

  it('selects a local ZIP without reading it', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({
      assets: [
        {
          lastModified: 0,
          mimeType: 'application/zip',
          name: 'reimbursd-export.zip',
          size: 128,
          uri: 'file:///cache/reimbursd-export.zip',
        },
      ],
      canceled: false,
    });

    await expect(selectStructuredExport()).resolves.toEqual({
      reportedByteSize: 128,
      uri: 'file:///cache/reimbursd-export.zip',
    });
    expect(getDocumentAsync).toHaveBeenCalledWith({
      base64: false,
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/zip', 'application/x-zip-compressed'],
    });
  });

  it('rejects a picker response without an asset', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({ assets: [], canceled: false });

    await expect(selectStructuredExport()).rejects.toThrow(
      'The document picker did not return a restore archive.',
    );
  });

  it('rejects a reported oversized archive before returning the selection', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({
      assets: [
        {
          lastModified: 0,
          mimeType: 'application/zip',
          name: 'oversized.zip',
          size: defaultStructuredExportParseLimits.maxArchiveByteSize + 1,
          uri: 'file:///cache/oversized.zip',
        },
      ],
      canceled: false,
    });

    await expect(selectStructuredExport()).rejects.toThrow(
      'Choose a Reimbursd export within the supported archive size limit.',
    );
  });
});
