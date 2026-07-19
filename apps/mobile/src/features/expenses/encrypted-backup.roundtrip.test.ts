// SPDX-License-Identifier: GPL-3.0-only
/// <reference types="node" />
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto';

import { createManualReceipt } from '@reimbursd/domain';
import type { EncryptedBackupCryptoProvider } from '@reimbursd/crypto';
import type { StructuredExportRecords } from '@reimbursd/export';
import { describe, expect, it, vi } from 'vitest';

import { LocalEncryptedBackupCoordinator } from './encrypted-backup.js';

const createdAt = '2026-07-18T15:00:00.000Z';
const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const merchantId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const receiptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const key = Uint8Array.from({ length: 32 }, (_, index) => index);

describe('encrypted backup round trip', () => {
  it('encrypts a real structured archive and restores its validated records', async () => {
    const records = populatedRecords();
    let saved: Uint8Array | null = null;
    const restoreClean = vi.fn().mockResolvedValue({
      attachmentDocumentCount: 0,
      categoryCount: 0,
      evidenceCount: 0,
      processingHistoryCount: 0,
      receiptCount: 1,
      tagCount: 0,
    });
    const coordinator = new LocalEncryptedBackupCoordinator({
      applicationVersion: '0.1.0',
      crypto: new NodeAesGcmProvider(),
      generator: { generateKey: vi.fn().mockResolvedValue(key) },
      hasher: {
        sha256: async (bytes) => createHash('sha256').update(bytes).digest('hex'),
      },
      idFactory: () => keyId,
      keyManager: null,
      now: () => new Date(createdAt),
      restoreRepository: { restoreClean },
      schemaVersion: 7,
      snapshotRepository: { getActiveSnapshot: vi.fn().mockResolvedValue(records) },
      storage: {
        delete: vi.fn(),
        read: vi.fn(),
        writeOnce: vi.fn(),
      },
      writer: {
        save: vi.fn().mockImplementation(async ({ bytes }) => {
          saved = Uint8Array.from(bytes);
        }),
      },
    });
    const prepared = await coordinator.prepare();

    await coordinator.create(prepared);
    expect(saved).not.toBeNull();
    await expect(coordinator.restore(saved!, prepared.recoveryKey)).resolves.toMatchObject({
      receiptCount: 1,
      recoveryKeyStored: null,
    });
    expect(restoreClean).toHaveBeenCalledWith(records);
  });
});

class NodeAesGcmProvider implements EncryptedBackupCryptoProvider {
  #nonceValue = 0;

  async encrypt({
    additionalData,
    key: encryptionKey,
    plaintext,
  }: Parameters<EncryptedBackupCryptoProvider['encrypt']>[0]) {
    const nonce = new Uint8Array(12);
    nonce[nonce.byteLength - 1] = this.#nonceValue;
    this.#nonceValue += 1;
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, nonce, { authTagLength: 16 });
    cipher.setAAD(additionalData);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    return {
      ciphertext: Uint8Array.from(ciphertext),
      nonce,
      tag: Uint8Array.from(cipher.getAuthTag()),
    };
  }

  async decrypt({
    additionalData,
    ciphertext,
    key: encryptionKey,
    nonce,
    tag,
  }: Parameters<EncryptedBackupCryptoProvider['decrypt']>[0]) {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey, nonce, { authTagLength: 16 });
    decipher.setAAD(additionalData);
    decipher.setAuthTag(tag);
    return Uint8Array.from(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  }
}

function populatedRecords(): StructuredExportRecords {
  return {
    categories: [],
    fieldEvidence: [],
    merchants: [
      {
        createdAt,
        displayName: 'Synthetic Market',
        id: merchantId,
        normalizedName: 'synthetic market',
        phone: null,
        updatedAt: createdAt,
        website: null,
      },
    ],
    processingHistory: [],
    receiptDocuments: [],
    receiptTags: [],
    receipts: [
      createManualReceipt({
        capturedAt: createdAt,
        currencyCode: 'USD',
        id: receiptId,
        merchantId,
        merchantName: 'Synthetic Market',
        purchasedAt: '2026-07-17T12:00:00-06:00',
        subtotalMinor: 1_000,
        taxMinor: 80,
        tipMinor: 0,
        totalMinor: 1_080,
      }),
    ],
    tags: [],
  };
}
