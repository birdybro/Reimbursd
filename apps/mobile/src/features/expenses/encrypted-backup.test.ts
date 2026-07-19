// SPDX-License-Identifier: GPL-3.0-only
import {
  BackupKeyManager,
  createEncryptedBackup,
  formatBackupRecoveryKey,
  openEncryptedBackup,
  type BackupKeyRecord,
} from '@reimbursd/crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalEncryptedBackupCoordinator } from './encrypted-backup.js';
import { createStructuredDataArchive } from './structured-export.js';
import { restoreStructuredData } from './structured-restore.js';

vi.mock('@reimbursd/crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('@reimbursd/crypto')>();
  return {
    ...original,
    createEncryptedBackup: vi.fn(),
    openEncryptedBackup: vi.fn(),
  };
});

vi.mock('./structured-export.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./structured-export.js')>();
  return { ...original, createStructuredDataArchive: vi.fn() };
});

vi.mock('./structured-restore.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('./structured-restore.js')>();
  return { ...original, restoreStructuredData: vi.fn() };
});

const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const encryptedBytes = Uint8Array.from([82, 66, 68]);
const structuredBytes = Uint8Array.from([80, 75, 3, 4]);
const createdAt = '2026-07-18T15:00:00.000Z';
const restored = {
  attachmentDocumentCount: 1,
  categoryCount: 0,
  evidenceCount: 0,
  processingHistoryCount: 0,
  receiptCount: 1,
  tagCount: 0,
};

describe('local encrypted backup coordinator', () => {
  beforeEach(() => {
    vi.mocked(createStructuredDataArchive)
      .mockReset()
      .mockResolvedValue({
        archive: {
          bytes: structuredBytes,
          filename: 'reimbursd-export-2026-07-18.zip',
          manifest: {} as never,
        },
        attachmentCount: 1,
        filename: 'reimbursd-export-2026-07-18.zip',
        receiptCount: 1,
      });
    vi.mocked(createEncryptedBackup)
      .mockReset()
      .mockResolvedValue({
        bytes: encryptedBytes,
        filename: 'reimbursd-backup-2026-07-18.rbd',
        manifest: {} as never,
      });
    vi.mocked(openEncryptedBackup)
      .mockReset()
      .mockResolvedValue({
        manifest: {
          keyId,
          keyVersion: 1,
        } as never,
        plaintext: structuredBytes,
      });
    vi.mocked(restoreStructuredData).mockReset().mockResolvedValue(restored);
  });

  it('prepares an ephemeral web key and creates a complete encrypted archive only after confirmation', async () => {
    const writer = { save: vi.fn().mockResolvedValue(undefined) };
    const generator = { generateKey: vi.fn().mockResolvedValue(key) };
    const coordinator = createCoordinator({ generator, keyManager: null, writer });
    const prepared = await coordinator.prepare();

    expect(prepared).toEqual({ keyRecord: record(), recoveryKey: formatBackupRecoveryKey(key) });
    expect(createStructuredDataArchive).not.toHaveBeenCalled();

    await expect(coordinator.create(prepared)).resolves.toEqual({
      attachmentCount: 1,
      filename: 'reimbursd-backup-2026-07-18.rbd',
      receiptCount: 1,
    });
    expect(createStructuredDataArchive).toHaveBeenCalledWith(
      expect.objectContaining({ includeOriginalAttachments: true }),
    );
    expect(createEncryptedBackup).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAt,
        key,
        keyId,
        plaintext: structuredBytes,
      }),
    );
    expect(writer.save).toHaveBeenCalledWith({
      bytes: encryptedBytes,
      filename: 'reimbursd-backup-2026-07-18.rbd',
    });
  });

  it('rejects an inconsistent prepared recovery key before reading local data', async () => {
    const coordinator = createCoordinator({ keyManager: null });
    const otherKey = Uint8Array.from(key);
    otherKey[0] = 255;

    await expect(
      coordinator.create({ keyRecord: record(), recoveryKey: formatBackupRecoveryKey(otherKey) }),
    ).rejects.toThrow('key is inconsistent');
    expect(createStructuredDataArchive).not.toHaveBeenCalled();
  });

  it('authenticates first, restores strictly, and only then retains the recovered key', async () => {
    const calls: string[] = [];
    vi.mocked(openEncryptedBackup).mockImplementation(async () => {
      calls.push('decrypt');
      return {
        manifest: { keyId, keyVersion: 1 } as never,
        plaintext: structuredBytes,
      };
    });
    vi.mocked(restoreStructuredData).mockImplementation(async () => {
      calls.push('restore');
      return restored;
    });
    const store = createStore();
    store.save.mockImplementation(async () => {
      calls.push('key');
    });
    const coordinator = createCoordinator({ keyManager: createKeyManager(store) });

    await expect(
      coordinator.restore(encryptedBytes, formatBackupRecoveryKey(key)),
    ).resolves.toEqual({ ...restored, recoveryKeyStored: true });
    expect(calls).toEqual(['decrypt', 'restore', 'key']);
    expect(restoreStructuredData).toHaveBeenCalledWith(
      expect.objectContaining({ bytes: structuredBytes, compatibleSchemaVersions: [6] }),
    );
    expect(store.save).toHaveBeenCalledWith(record());
  });

  it('reports secure key retention failure without misreporting the completed restore', async () => {
    const store = createStore();
    store.save.mockRejectedValue(new Error('synthetic secure store failure'));
    const coordinator = createCoordinator({ keyManager: createKeyManager(store) });

    await expect(
      coordinator.restore(encryptedBytes, formatBackupRecoveryKey(key)),
    ).resolves.toEqual({ ...restored, recoveryKeyStored: false });
  });
});

function createCoordinator({
  generator = { generateKey: vi.fn().mockResolvedValue(key) },
  keyManager,
  writer = { save: vi.fn().mockResolvedValue(undefined) },
}: {
  readonly generator?: { generateKey(): Promise<Uint8Array> };
  readonly keyManager: BackupKeyManager | null;
  readonly writer?: { save(file: { bytes: Uint8Array; filename: string }): Promise<void> };
}) {
  return new LocalEncryptedBackupCoordinator({
    applicationVersion: '0.1.0',
    crypto: { decrypt: vi.fn(), encrypt: vi.fn() },
    generator,
    hasher: { sha256: vi.fn() },
    idFactory: () => keyId,
    keyManager,
    now: () => new Date(createdAt),
    restoreRepository: {} as never,
    schemaVersion: 7,
    snapshotRepository: {} as never,
    storage: {} as never,
    writer,
  });
}

function createKeyManager(store: ReturnType<typeof createStore>): BackupKeyManager {
  return new BackupKeyManager({
    generator: { generateKey: vi.fn().mockResolvedValue(key) },
    idFactory: () => keyId,
    store,
  });
}

function createStore() {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function record(): BackupKeyRecord {
  return { key: Uint8Array.from(key), keyId, keyVersion: 1 };
}
