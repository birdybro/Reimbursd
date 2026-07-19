// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';
import { deleteItemAsync, getItemAsync, isAvailableAsync, setItemAsync } from 'expo-secure-store';

import { formatBackupRecoveryKey, type BackupKeyRecord } from '@reimbursd/crypto';

import {
  ExpoSecureBackupKeyStore,
  SecureBackupKeyStoreCorruptError,
  SecureBackupKeyStoreUnavailableError,
} from '../secure-backup-key-store';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
  deleteItemAsync: jest.fn(),
  getItemAsync: jest.fn(),
  isAvailableAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));

const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = Uint8Array.from({ length: 32 }, (_, index) => index);
const options = {
  keychainAccessible: 7,
  keychainService: 'app.reimbursd.backup-key',
  requireAuthentication: false,
};

describe('Expo secure backup key store', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    jest.mocked(isAvailableAsync).mockResolvedValue(true);
    jest.mocked(getItemAsync).mockResolvedValue(null);
    jest.mocked(setItemAsync).mockResolvedValue(undefined);
    jest.mocked(deleteItemAsync).mockResolvedValue(undefined);
  });

  test('stores and retrieves a small versioned key record with device-only accessibility', async () => {
    const store = new ExpoSecureBackupKeyStore();
    const record = backupKeyRecord();
    await store.save(record);
    const stored = JSON.stringify({
      format: 'reimbursd-backup-key',
      keyId,
      keyVersion: 1,
      recoveryKey: formatBackupRecoveryKey(key),
    });
    expect(setItemAsync).toHaveBeenCalledWith('reimbursd.backup-key.v1', stored, options);

    jest.mocked(getItemAsync).mockResolvedValue(stored);
    const loaded = await store.get();
    expect(loaded).toEqual(record);
    loaded?.key.fill(255);
    await expect(store.get()).resolves.toEqual(record);
    expect(getItemAsync).toHaveBeenCalledWith('reimbursd.backup-key.v1', options);
  });

  test('rejects malformed or unexpected secure records without exposing their contents', async () => {
    const store = new ExpoSecureBackupKeyStore();

    for (const stored of [
      '{',
      JSON.stringify({ format: 'wrong', keyId, keyVersion: 1, recoveryKey: 'private value' }),
      JSON.stringify({
        extra: true,
        format: 'reimbursd-backup-key',
        keyId,
        keyVersion: 1,
        recoveryKey: formatBackupRecoveryKey(key),
      }),
    ]) {
      jest.mocked(getItemAsync).mockResolvedValueOnce(stored);
      await expect(store.get()).rejects.toBeInstanceOf(SecureBackupKeyStoreCorruptError);
    }
  });

  test('does not persist keys on web and reports unavailable native secure storage', async () => {
    const store = new ExpoSecureBackupKeyStore();
    Platform.OS = 'web';

    await expect(store.get()).resolves.toBeNull();
    await expect(store.delete()).resolves.toBeUndefined();
    await expect(store.save(backupKeyRecord())).rejects.toBeInstanceOf(
      SecureBackupKeyStoreUnavailableError,
    );
    expect(isAvailableAsync).not.toHaveBeenCalled();
    expect(setItemAsync).not.toHaveBeenCalled();

    Platform.OS = 'android';
    jest.mocked(isAvailableAsync).mockResolvedValue(false);
    await expect(store.save(backupKeyRecord())).rejects.toBeInstanceOf(
      SecureBackupKeyStoreUnavailableError,
    );
  });

  test('deletes the native key idempotently when secure storage is available', async () => {
    await new ExpoSecureBackupKeyStore().delete();

    expect(deleteItemAsync).toHaveBeenCalledWith('reimbursd.backup-key.v1', options);
  });
});

function backupKeyRecord(): BackupKeyRecord {
  return { key: Uint8Array.from(key), keyId, keyVersion: 1 };
}
