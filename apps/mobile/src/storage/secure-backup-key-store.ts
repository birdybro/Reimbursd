// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';
import {
  WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  deleteItemAsync,
  getItemAsync,
  isAvailableAsync,
  setItemAsync,
  type SecureStoreOptions,
} from 'expo-secure-store';

import {
  assertBackupKeyRecord,
  formatBackupRecoveryKey,
  parseBackupRecoveryKey,
  type BackupKeyRecord,
  type BackupKeyStore,
} from '@reimbursd/crypto';

const storageKey = 'reimbursd.backup-key.v1';
const storageOptions: SecureStoreOptions = {
  keychainAccessible: WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'app.reimbursd.backup-key',
  requireAuthentication: false,
};

export class SecureBackupKeyStoreUnavailableError extends Error {
  constructor() {
    super('Secure backup key storage is unavailable on this platform.');
    this.name = 'SecureBackupKeyStoreUnavailableError';
  }
}

export class SecureBackupKeyStoreCorruptError extends Error {
  constructor() {
    super('The stored backup key record is invalid.');
    this.name = 'SecureBackupKeyStoreCorruptError';
  }
}

export class ExpoSecureBackupKeyStore implements BackupKeyStore {
  async delete(): Promise<void> {
    if (!(await secureStoreAvailable())) {
      return;
    }

    await deleteItemAsync(storageKey, storageOptions);
  }

  async get(): Promise<BackupKeyRecord | null> {
    if (!(await secureStoreAvailable())) {
      return null;
    }

    const stored = await getItemAsync(storageKey, storageOptions);

    if (stored === null) {
      return null;
    }

    return parseStoredRecord(stored);
  }

  async save(record: BackupKeyRecord): Promise<void> {
    if (!(await secureStoreAvailable())) {
      throw new SecureBackupKeyStoreUnavailableError();
    }

    assertBackupKeyRecord(record);
    await setItemAsync(
      storageKey,
      JSON.stringify({
        format: 'reimbursd-backup-key',
        keyId: record.keyId,
        keyVersion: record.keyVersion,
        recoveryKey: formatBackupRecoveryKey(record.key),
      }),
      storageOptions,
    );
  }
}

async function secureStoreAvailable(): Promise<boolean> {
  return Platform.OS !== 'web' && (await isAvailableAsync());
}

function parseStoredRecord(value: string): BackupKeyRecord {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    throw new SecureBackupKeyStoreCorruptError();
  }

  if (
    !isRecord(parsed) ||
    Object.keys(parsed).sort().join(',') !== 'format,keyId,keyVersion,recoveryKey' ||
    parsed.format !== 'reimbursd-backup-key' ||
    typeof parsed.keyId !== 'string' ||
    parsed.keyVersion !== 1 ||
    typeof parsed.recoveryKey !== 'string'
  ) {
    throw new SecureBackupKeyStoreCorruptError();
  }

  try {
    const record: BackupKeyRecord = {
      key: parseBackupRecoveryKey(parsed.recoveryKey),
      keyId: parsed.keyId,
      keyVersion: 1,
    };
    assertBackupKeyRecord(record);
    return record;
  } catch {
    throw new SecureBackupKeyStoreCorruptError();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
