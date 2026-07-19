// SPDX-License-Identifier: GPL-3.0-only
import { getDocumentAsync } from 'expo-document-picker';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultEncryptedBackupLimits } from '@reimbursd/crypto';

import { selectEncryptedBackup } from './encrypted-backup-picker.js';

vi.mock('expo-document-picker', () => ({ getDocumentAsync: vi.fn() }));

describe('encrypted backup restore picker', () => {
  beforeEach(() => {
    vi.mocked(getDocumentAsync).mockReset();
  });

  it('returns null when selection is canceled', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({ assets: null, canceled: true });

    await expect(selectEncryptedBackup()).resolves.toBeNull();
  });

  it('selects a bounded local encrypted backup without reading it', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValue({
      assets: [
        {
          lastModified: 0,
          mimeType: 'application/x-reimbursd-backup',
          name: 'reimbursd-backup.rbd',
          size: 128,
          uri: 'file:///cache/reimbursd-backup.rbd',
        },
      ],
      canceled: false,
    });

    await expect(selectEncryptedBackup()).resolves.toEqual({
      reportedByteSize: 128,
      uri: 'file:///cache/reimbursd-backup.rbd',
    });
    expect(getDocumentAsync).toHaveBeenCalledWith({
      base64: false,
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/octet-stream', 'application/x-reimbursd-backup'],
    });
  });

  it('rejects missing and reported oversized selections', async () => {
    vi.mocked(getDocumentAsync).mockResolvedValueOnce({ assets: [], canceled: false });
    await expect(selectEncryptedBackup()).rejects.toThrow('did not return an encrypted backup');

    vi.mocked(getDocumentAsync).mockResolvedValueOnce({
      assets: [
        {
          lastModified: 0,
          name: 'oversized.rbd',
          size: defaultEncryptedBackupLimits.maxEnvelopeByteSize + 1,
          uri: 'file:///cache/oversized.rbd',
        },
      ],
      canceled: false,
    });
    await expect(selectEncryptedBackup()).rejects.toThrow('supported file size limit');
  });
});
