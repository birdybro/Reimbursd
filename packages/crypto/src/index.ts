// SPDX-License-Identifier: GPL-3.0-only
export {
  createEncryptedBackup,
  defaultEncryptedBackupLimits,
  encryptedBackupFormatVersion,
  encryptedBackupKeyByteSize,
  EncryptedBackupAuthenticationError,
  EncryptedBackupValidationError,
  formatBackupRecoveryKey,
  openEncryptedBackup,
  parseBackupRecoveryKey,
  type AuthenticatedCiphertext,
  type EncryptedBackupArchive,
  type EncryptedBackupCryptoProvider,
  type EncryptedBackupLimits,
  type EncryptedBackupManifest,
  type OpenedEncryptedBackup,
} from './encrypted-backup.js';
export {
  assertBackupKeyRecord,
  BackupKeyManager,
  BackupKeyValidationError,
  type BackupKeyGenerator,
  type BackupKeyRecord,
  type BackupKeyStore,
} from './backup-key.js';
