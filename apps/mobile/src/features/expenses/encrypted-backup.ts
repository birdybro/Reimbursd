// SPDX-License-Identifier: GPL-3.0-only
import type {
  StructuredExportSnapshotRepository,
  StructuredImportRepository,
  StructuredImportResult,
} from '@reimbursd/database';
import {
  assertBackupKeyRecord,
  createEncryptedBackup,
  formatBackupRecoveryKey,
  openEncryptedBackup,
  parseBackupRecoveryKey,
  type BackupKeyGenerator,
  type BackupKeyManager,
  type BackupKeyRecord,
  type EncryptedBackupCryptoProvider,
} from '@reimbursd/crypto';
import type { StructuredExportHasher } from '@reimbursd/export';

import {
  createStructuredDataArchive,
  type StructuredExportAttachmentStorage,
  type StructuredExportWriter,
} from './structured-export.js';
import { restoreStructuredData, type StructuredRestoreStorage } from './structured-restore.js';

export interface PreparedEncryptedBackup {
  readonly keyRecord: BackupKeyRecord;
  readonly recoveryKey: string;
}

export interface EncryptedBackupResult {
  readonly attachmentCount: number;
  readonly filename: string;
  readonly receiptCount: number;
}

export interface EncryptedRestoreResult extends StructuredImportResult {
  readonly recoveryKeyStored: boolean | null;
}

export class LocalEncryptedBackupCoordinator {
  readonly #applicationVersion: string;
  readonly #crypto: EncryptedBackupCryptoProvider;
  readonly #generator: BackupKeyGenerator;
  readonly #hasher: StructuredExportHasher;
  readonly #idFactory: () => string;
  readonly #keyManager: BackupKeyManager | null;
  readonly #now: () => Date;
  readonly #restoreRepository: StructuredImportRepository;
  readonly #schemaVersion: number;
  readonly #snapshotRepository: StructuredExportSnapshotRepository;
  readonly #storage: StructuredExportAttachmentStorage & StructuredRestoreStorage;
  readonly #writer: StructuredExportWriter;

  constructor(dependencies: {
    readonly applicationVersion: string;
    readonly crypto: EncryptedBackupCryptoProvider;
    readonly generator: BackupKeyGenerator;
    readonly hasher: StructuredExportHasher;
    readonly idFactory: () => string;
    readonly keyManager: BackupKeyManager | null;
    readonly now?: () => Date;
    readonly restoreRepository: StructuredImportRepository;
    readonly schemaVersion: number;
    readonly snapshotRepository: StructuredExportSnapshotRepository;
    readonly storage: StructuredExportAttachmentStorage & StructuredRestoreStorage;
    readonly writer: StructuredExportWriter;
  }) {
    this.#applicationVersion = dependencies.applicationVersion;
    this.#crypto = dependencies.crypto;
    this.#generator = dependencies.generator;
    this.#hasher = dependencies.hasher;
    this.#idFactory = dependencies.idFactory;
    this.#keyManager = dependencies.keyManager;
    this.#now = dependencies.now ?? (() => new Date());
    this.#restoreRepository = dependencies.restoreRepository;
    this.#schemaVersion = dependencies.schemaVersion;
    this.#snapshotRepository = dependencies.snapshotRepository;
    this.#storage = dependencies.storage;
    this.#writer = dependencies.writer;
  }

  async prepare(): Promise<PreparedEncryptedBackup> {
    const keyRecord =
      this.#keyManager === null
        ? {
            key: Uint8Array.from(await this.#generator.generateKey()),
            keyId: this.#idFactory(),
            keyVersion: 1 as const,
          }
        : await this.#keyManager.getOrCreate();
    assertBackupKeyRecord(keyRecord);

    return {
      keyRecord: cloneKeyRecord(keyRecord),
      recoveryKey: formatBackupRecoveryKey(keyRecord.key),
    };
  }

  async create(prepared: PreparedEncryptedBackup): Promise<EncryptedBackupResult> {
    assertBackupKeyRecord(prepared.keyRecord);
    const recoveryKeyBytes = parseBackupRecoveryKey(prepared.recoveryKey);
    const recoveryKeyMatches = keysEqual(recoveryKeyBytes, prepared.keyRecord.key);
    recoveryKeyBytes.fill(0);

    if (!recoveryKeyMatches) {
      throw new TypeError('Prepared encrypted backup key is inconsistent.');
    }

    const now = this.#now();
    const structured = await createStructuredDataArchive({
      applicationVersion: this.#applicationVersion,
      hasher: this.#hasher,
      includeOriginalAttachments: true,
      now: () => now,
      repository: this.#snapshotRepository,
      schemaVersion: this.#schemaVersion,
      storage: this.#storage,
    });
    const encrypted = await createEncryptedBackup({
      createdAt: now.toISOString(),
      crypto: this.#crypto,
      key: prepared.keyRecord.key,
      keyId: prepared.keyRecord.keyId,
      plaintext: structured.archive.bytes,
    });
    await this.#writer.save({ bytes: encrypted.bytes, filename: encrypted.filename });

    return {
      attachmentCount: structured.attachmentCount,
      filename: encrypted.filename,
      receiptCount: structured.receiptCount,
    };
  }

  async restore(bytes: Uint8Array, recoveryKey: string): Promise<EncryptedRestoreResult> {
    const key = parseBackupRecoveryKey(recoveryKey);
    try {
      const opened = await openEncryptedBackup({ bytes, crypto: this.#crypto, key });
      const restored = await restoreStructuredData({
        bytes: opened.plaintext,
        compatibleSchemaVersions: [6],
        hasher: this.#hasher,
        repository: this.#restoreRepository,
        storage: this.#storage,
        supportedSchemaVersion: this.#schemaVersion,
      });
      let recoveryKeyStored: boolean | null = null;

      if (this.#keyManager !== null) {
        try {
          await this.#keyManager.saveRecovered({
            key,
            keyId: opened.manifest.keyId,
            keyVersion: opened.manifest.keyVersion,
          });
          recoveryKeyStored = true;
        } catch {
          recoveryKeyStored = false;
        }
      }

      return { ...restored, recoveryKeyStored };
    } finally {
      key.fill(0);
    }
  }
}

function cloneKeyRecord(record: BackupKeyRecord): BackupKeyRecord {
  return { ...record, key: Uint8Array.from(record.key) };
}

function keysEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
