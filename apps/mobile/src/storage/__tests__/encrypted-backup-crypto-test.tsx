// SPDX-License-Identifier: GPL-3.0-only
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

import { ExpoEncryptedBackupCryptoProvider } from '../encrypted-backup-crypto';

jest.mock('expo-crypto', () => ({
  AESKeySize: { AES256: 256 },
  AESEncryptionKey: { generate: jest.fn(), import: jest.fn() },
  AESSealedData: { fromParts: jest.fn() },
  aesDecryptAsync: jest.fn(),
  aesEncryptAsync: jest.fn(),
}));

const encryptionKey = { bytes: jest.fn() };
const importedKey = { kind: 'imported-key' };
const sealedData = {
  ciphertext: jest.fn(),
  iv: jest.fn(),
  tag: jest.fn(),
};

describe('Expo encrypted backup crypto provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    encryptionKey.bytes.mockResolvedValue(Uint8Array.from({ length: 32 }, (_, index) => index));
    jest.mocked(AESEncryptionKey.generate).mockResolvedValue(encryptionKey as never);
    jest.mocked(AESEncryptionKey.import).mockResolvedValue(importedKey as never);
    sealedData.ciphertext.mockResolvedValue(Uint8Array.from([4, 5, 6]));
    sealedData.iv.mockResolvedValue(Uint8Array.from({ length: 12 }, () => 7));
    sealedData.tag.mockResolvedValue(Uint8Array.from({ length: 16 }, () => 8));
    jest.mocked(aesEncryptAsync).mockResolvedValue(sealedData as never);
    jest.mocked(AESSealedData.fromParts).mockReturnValue(sealedData as never);
    jest.mocked(aesDecryptAsync).mockResolvedValue(Uint8Array.from([1, 2, 3]));
  });

  test('generates an owned AES-256 key', async () => {
    const provider = new ExpoEncryptedBackupCryptoProvider();
    const generated = await provider.generateKey();

    expect(AESEncryptionKey.generate).toHaveBeenCalledWith(256);
    expect(generated).toEqual(Uint8Array.from({ length: 32 }, (_, index) => index));
    generated.fill(255);
    expect(await encryptionKey.bytes()).toEqual(
      Uint8Array.from({ length: 32 }, (_, index) => index),
    );
  });

  test('encrypts with copied AAD, a generated 12-byte nonce, and a full tag', async () => {
    const provider = new ExpoEncryptedBackupCryptoProvider();
    const key = Uint8Array.from({ length: 32 }, () => 1);
    const plaintext = Uint8Array.from([1, 2, 3]);
    const additionalData = Uint8Array.from([9, 10]);

    await expect(provider.encrypt({ additionalData, key, plaintext })).resolves.toEqual({
      ciphertext: Uint8Array.from([4, 5, 6]),
      nonce: Uint8Array.from({ length: 12 }, () => 7),
      tag: Uint8Array.from({ length: 16 }, () => 8),
    });
    expect(AESEncryptionKey.import).toHaveBeenCalledWith(key);
    expect(aesEncryptAsync).toHaveBeenCalledWith(plaintext, importedKey, {
      additionalData,
      nonce: { length: 12 },
      tagLength: 16,
    });
    expect(sealedData.ciphertext).toHaveBeenCalledWith({
      encoding: 'bytes',
      includeTag: false,
    });
  });

  test('reconstructs sealed data and authenticates the same AAD during decryption', async () => {
    const provider = new ExpoEncryptedBackupCryptoProvider();
    const key = Uint8Array.from({ length: 32 }, () => 1);
    const nonce = Uint8Array.from({ length: 12 }, () => 2);
    const ciphertext = Uint8Array.from([3, 4]);
    const tag = Uint8Array.from({ length: 16 }, () => 5);
    const additionalData = Uint8Array.from([6, 7]);

    await expect(
      provider.decrypt({ additionalData, ciphertext, key, nonce, tag }),
    ).resolves.toEqual(Uint8Array.from([1, 2, 3]));
    expect(AESSealedData.fromParts).toHaveBeenCalledWith(nonce, ciphertext, tag);
    expect(aesDecryptAsync).toHaveBeenCalledWith(sealedData, importedKey, {
      additionalData,
      output: 'bytes',
    });
  });
});
