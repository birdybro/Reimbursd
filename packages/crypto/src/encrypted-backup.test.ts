// SPDX-License-Identifier: GPL-3.0-only
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createEncryptedBackup,
  defaultEncryptedBackupLimits,
  EncryptedBackupAuthenticationError,
  EncryptedBackupValidationError,
  formatBackupRecoveryKey,
  openEncryptedBackup,
  parseBackupRecoveryKey,
  type EncryptedBackupCryptoProvider,
} from './encrypted-backup.js';

const createdAt = '2026-07-18T09:00:00-06:00';
const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const plaintext = Uint8Array.from([80, 75, 3, 4, 1, 2, 3, 4]);

describe('authenticated encrypted backup envelope', () => {
  it('round-trips owned bytes through AES-256-GCM with authenticated metadata', async () => {
    const key = Uint8Array.from(randomBytes(32));
    const recoveryKey = Uint8Array.from(key);
    const source = Uint8Array.from(plaintext);
    const crypto = new NodeAesGcmProvider();
    const archive = await createEncryptedBackup({
      createdAt,
      crypto,
      key,
      keyId,
      plaintext: source,
    });

    expect(archive.filename).toBe('reimbursd-backup-2026-07-18.rbd');
    expect(archive.manifest).toEqual({
      algorithm: 'AES-256-GCM',
      ciphertextByteSize: plaintext.byteLength,
      createdAt,
      format: 'reimbursd-encrypted-backup',
      formatVersion: 1,
      keyId,
      keyVersion: 1,
      nonceByteSize: 12,
      plaintextByteSize: plaintext.byteLength,
      tagByteSize: 16,
    });
    await expect(openEncryptedBackup({ bytes: archive.bytes, crypto, key })).resolves.toEqual({
      manifest: archive.manifest,
      plaintext,
    });

    source[0] = 0;
    key[0] = (key[0] ?? 0) ^ 0xff;
    expect(
      (await openEncryptedBackup({ bytes: archive.bytes, crypto, key: recoveryKey })).plaintext[0],
    ).toBe(80);
  });

  it('uses a fresh platform nonce for repeated backup creation with one key', async () => {
    const key = Uint8Array.from(randomBytes(32));
    let nonceValue = 0;
    const crypto = new NodeAesGcmProvider(() => {
      const nonce = new Uint8Array(12);
      nonce[nonce.byteLength - 1] = nonceValue;
      nonceValue += 1;
      return nonce;
    });
    const first = await createEncryptedBackup({ createdAt, crypto, key, keyId, plaintext });
    const second = await createEncryptedBackup({ createdAt, crypto, key, keyId, plaintext });

    expect(first.bytes).not.toEqual(second.bytes);
  });

  it('rejects wrong keys plus ciphertext, tag, and valid-looking header changes', async () => {
    const key = Uint8Array.from(randomBytes(32));
    const crypto = new NodeAesGcmProvider();
    const archive = await createEncryptedBackup({ createdAt, crypto, key, keyId, plaintext });
    const corruptedCiphertext = Uint8Array.from(archive.bytes);
    const ciphertextIndex = corruptedCiphertext.byteLength - tagByteSizeForTest - 1;
    corruptedCiphertext[ciphertextIndex] = (corruptedCiphertext[ciphertextIndex] ?? 0) ^ 0xff;
    const corruptedPayload = Uint8Array.from(archive.bytes);
    const tagIndex = corruptedPayload.byteLength - 1;
    corruptedPayload[tagIndex] = (corruptedPayload[tagIndex] ?? 0) ^ 0xff;
    const changedHeader = replaceAscii(archive.bytes, createdAt, '2026-07-19T09:00:00-06:00');

    for (const input of [
      { bytes: archive.bytes, key: Uint8Array.from(randomBytes(32)) },
      { bytes: corruptedCiphertext, key },
      { bytes: corruptedPayload, key },
      { bytes: changedHeader, key },
    ]) {
      await expect(openEncryptedBackup({ ...input, crypto })).rejects.toBeInstanceOf(
        EncryptedBackupAuthenticationError,
      );
    }
  });

  it('rejects malformed, truncated, and over-limit envelopes before provider decryption', async () => {
    const key = Uint8Array.from(randomBytes(32));
    const provider = new NodeAesGcmProvider();
    const archive = await createEncryptedBackup({
      createdAt,
      crypto: provider,
      key,
      keyId,
      plaintext,
    });
    const decrypt = vi.fn();
    const crypto = { decrypt, encrypt: vi.fn() } satisfies EncryptedBackupCryptoProvider;

    await expect(
      openEncryptedBackup({ bytes: new Uint8Array(), crypto, key }),
    ).rejects.toBeInstanceOf(EncryptedBackupValidationError);
    await expect(
      openEncryptedBackup({ bytes: archive.bytes.slice(0, -1), crypto, key }),
    ).rejects.toThrow('payload size is inconsistent');
    await expect(
      openEncryptedBackup({
        bytes: archive.bytes,
        crypto,
        key,
        limits: {
          maxHeaderByteSize: archive.bytes.byteLength - 1,
          maxEnvelopeByteSize: archive.bytes.byteLength - 1,
          maxPlaintextByteSize: plaintext.byteLength,
        },
      }),
    ).rejects.toThrow('envelope is invalid');
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('rejects invalid keys, plaintext limits, and provider output shapes', async () => {
    const key = Uint8Array.from(randomBytes(32));
    const invalidProvider: EncryptedBackupCryptoProvider = {
      decrypt: vi.fn(),
      encrypt: vi.fn().mockResolvedValue({
        ciphertext: Uint8Array.from(plaintext),
        nonce: new Uint8Array(11),
        tag: new Uint8Array(16),
      }),
    };

    await expect(
      createEncryptedBackup({ createdAt, crypto: invalidProvider, key, keyId, plaintext }),
    ).rejects.toThrow('provider returned invalid sealed data');
    await expect(
      createEncryptedBackup({
        createdAt,
        crypto: invalidProvider,
        key: new Uint8Array(31),
        keyId,
        plaintext,
      }),
    ).rejects.toThrow('key size is invalid');
    await expect(
      createEncryptedBackup({
        createdAt,
        crypto: invalidProvider,
        key,
        keyId,
        limits: { ...defaultEncryptedBackupLimits, maxPlaintextByteSize: plaintext.byteLength - 1 },
        plaintext,
      }),
    ).rejects.toThrow('plaintext size is invalid');
  });

  it('formats and strictly parses portable recovery keys', () => {
    const key = Uint8Array.from({ length: 32 }, (_, index) => index);
    const formatted = formatBackupRecoveryKey(key);

    expect(formatted).toBe(
      'RBK1-00010203-04050607-08090A0B-0C0D0E0F-10111213-14151617-18191A1B-1C1D1E1F',
    );
    expect(parseBackupRecoveryKey(`  ${formatted.toLowerCase()}  `)).toEqual(key);
    expect(() => parseBackupRecoveryKey(`${formatted.slice(0, -1)}Z`)).toThrow(
      'recovery key format is invalid',
    );
  });
});

class NodeAesGcmProvider implements EncryptedBackupCryptoProvider {
  readonly #nonceFactory: () => Uint8Array;

  constructor(nonceFactory: () => Uint8Array = () => Uint8Array.from(randomBytes(12))) {
    this.#nonceFactory = nonceFactory;
  }

  async encrypt({
    additionalData,
    key,
    plaintext,
  }: Parameters<EncryptedBackupCryptoProvider['encrypt']>[0]) {
    const nonce = this.#nonceFactory();
    const cipher = createCipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    cipher.setAAD(additionalData);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      ciphertext: Uint8Array.from(ciphertext),
      nonce: Uint8Array.from(nonce),
      tag: Uint8Array.from(cipher.getAuthTag()),
    };
  }

  async decrypt({
    additionalData,
    ciphertext,
    key,
    nonce,
    tag,
  }: Parameters<EncryptedBackupCryptoProvider['decrypt']>[0]) {
    const decipher = createDecipheriv('aes-256-gcm', key, nonce, { authTagLength: 16 });
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return Uint8Array.from(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  }
}

const tagByteSizeForTest = 16;

function replaceAscii(bytes: Uint8Array, search: string, replacement: string): Uint8Array {
  if (search.length !== replacement.length) {
    throw new Error('Synthetic header replacement must preserve length.');
  }

  const result = Uint8Array.from(bytes);
  const searchBytes = Array.from(search, (character) => character.charCodeAt(0));
  const index = result.findIndex((_byte, offset) =>
    searchBytes.every((expected, relative) => result[offset + relative] === expected),
  );

  if (index < 0) {
    throw new Error('Synthetic header text was not found.');
  }

  for (let offset = 0; offset < replacement.length; offset += 1) {
    result[index + offset] = replacement.charCodeAt(offset);
  }

  return result;
}
