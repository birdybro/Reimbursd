// SPDX-License-Identifier: GPL-3.0-only
import { encryptedBackupKeyByteSize } from './encrypted-backup.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface BackupKeyRecord {
  readonly key: Uint8Array;
  readonly keyId: string;
  readonly keyVersion: 1;
}

export interface BackupKeyStore {
  delete(): Promise<void>;
  get(): Promise<BackupKeyRecord | null>;
  save(record: BackupKeyRecord): Promise<void>;
}

export interface BackupKeyGenerator {
  generateKey(): Promise<Uint8Array>;
}

export class BackupKeyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupKeyValidationError';
  }
}

export class BackupKeyManager {
  readonly #generator: BackupKeyGenerator;
  readonly #idFactory: () => string;
  #pending: Promise<BackupKeyRecord> | undefined;
  readonly #store: BackupKeyStore;

  constructor(dependencies: {
    readonly generator: BackupKeyGenerator;
    readonly idFactory: () => string;
    readonly store: BackupKeyStore;
  }) {
    this.#generator = dependencies.generator;
    this.#idFactory = dependencies.idFactory;
    this.#store = dependencies.store;
  }

  async delete(): Promise<void> {
    await this.#store.delete();
  }

  async getExisting(): Promise<BackupKeyRecord | null> {
    const record = await this.#store.get();

    if (record === null) {
      return null;
    }

    assertBackupKeyRecord(record);
    return cloneRecord(record);
  }

  async getOrCreate(): Promise<BackupKeyRecord> {
    this.#pending ??= this.#createOrLoad().finally(() => {
      this.#pending = undefined;
    });
    return cloneRecord(await this.#pending);
  }

  async saveRecovered(record: BackupKeyRecord): Promise<void> {
    assertBackupKeyRecord(record);
    await this.#store.save(cloneRecord(record));
  }

  async #createOrLoad(): Promise<BackupKeyRecord> {
    const existing = await this.getExisting();

    if (existing !== null) {
      return existing;
    }

    const record: BackupKeyRecord = {
      key: Uint8Array.from(await this.#generator.generateKey()),
      keyId: this.#idFactory(),
      keyVersion: 1,
    };
    assertBackupKeyRecord(record);
    await this.#store.save(cloneRecord(record));
    return record;
  }
}

export function assertBackupKeyRecord(record: BackupKeyRecord): void {
  if (
    !uuidPattern.test(record.keyId) ||
    record.keyVersion !== 1 ||
    record.key.byteLength !== encryptedBackupKeyByteSize
  ) {
    throw new BackupKeyValidationError('Backup key record is invalid.');
  }
}

function cloneRecord(record: BackupKeyRecord): BackupKeyRecord {
  return { ...record, key: Uint8Array.from(record.key) };
}
