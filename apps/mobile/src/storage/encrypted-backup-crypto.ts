// SPDX-License-Identifier: GPL-3.0-only
import {
  AESKeySize,
  AESEncryptionKey,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
} from 'expo-crypto';

import type { BackupKeyGenerator, EncryptedBackupCryptoProvider } from '@reimbursd/crypto';

export class ExpoEncryptedBackupCryptoProvider
  implements EncryptedBackupCryptoProvider, BackupKeyGenerator
{
  async generateKey(): Promise<Uint8Array> {
    const key = await AESEncryptionKey.generate(AESKeySize.AES256);
    return Uint8Array.from(await key.bytes());
  }

  async encrypt({
    additionalData,
    key,
    plaintext,
  }: Parameters<EncryptedBackupCryptoProvider['encrypt']>[0]) {
    const encryptionKey = await AESEncryptionKey.import(Uint8Array.from(key));
    const sealed = await aesEncryptAsync(Uint8Array.from(plaintext), encryptionKey, {
      additionalData: Uint8Array.from(additionalData),
      nonce: { length: 12 },
      tagLength: 16,
    });

    return {
      ciphertext: Uint8Array.from(
        await sealed.ciphertext({ encoding: 'bytes', includeTag: false }),
      ),
      nonce: Uint8Array.from(await sealed.iv('bytes')),
      tag: Uint8Array.from(await sealed.tag('bytes')),
    };
  }

  async decrypt({
    additionalData,
    ciphertext,
    key,
    nonce,
    tag,
  }: Parameters<EncryptedBackupCryptoProvider['decrypt']>[0]): Promise<Uint8Array> {
    const encryptionKey = await AESEncryptionKey.import(Uint8Array.from(key));
    const sealed = AESSealedData.fromParts(
      Uint8Array.from(nonce),
      Uint8Array.from(ciphertext),
      Uint8Array.from(tag),
    );
    return Uint8Array.from(
      await aesDecryptAsync(sealed, encryptionKey, {
        additionalData: Uint8Array.from(additionalData),
        output: 'bytes',
      }),
    );
  }
}
