// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';

import {
  BackupKeyManager,
  BackupKeyValidationError,
  type BackupKeyRecord,
  type BackupKeyStore,
} from './backup-key.js';

const keyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const key = Uint8Array.from({ length: 32 }, (_, index) => index);

describe('backup key lifecycle', () => {
  it('returns an owned existing key without generating or rewriting it', async () => {
    const existing = record();
    const store = createStore(existing);
    const generator = { generateKey: vi.fn() };
    const manager = new BackupKeyManager({ generator, idFactory: vi.fn(), store });
    const loaded = await manager.getOrCreate();

    expect(loaded).toEqual(existing);
    loaded.key[0] = 255;
    expect(existing.key[0]).toBe(0);
    expect(generator.generateKey).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });

  it('generates and saves one key across concurrent creation calls', async () => {
    const store = createStore(null);
    const generator = { generateKey: vi.fn().mockResolvedValue(key) };
    const manager = new BackupKeyManager({ generator, idFactory: () => keyId, store });

    const [first, second] = await Promise.all([manager.getOrCreate(), manager.getOrCreate()]);

    expect(first).toEqual(record());
    expect(second).toEqual(record());
    expect(first).not.toBe(second);
    expect(generator.generateKey).toHaveBeenCalledTimes(1);
    expect(store.save).toHaveBeenCalledTimes(1);
  });

  it('validates stored, generated, and recovered records before use', async () => {
    const invalid = { ...record(), key: new Uint8Array(31) };
    const storedManager = new BackupKeyManager({
      generator: { generateKey: vi.fn() },
      idFactory: () => keyId,
      store: createStore(invalid),
    });
    await expect(storedManager.getExisting()).rejects.toBeInstanceOf(BackupKeyValidationError);

    const generatedManager = new BackupKeyManager({
      generator: { generateKey: vi.fn().mockResolvedValue(new Uint8Array(31)) },
      idFactory: () => keyId,
      store: createStore(null),
    });
    await expect(generatedManager.getOrCreate()).rejects.toBeInstanceOf(BackupKeyValidationError);
    await expect(generatedManager.saveRecovered(invalid)).rejects.toBeInstanceOf(
      BackupKeyValidationError,
    );
  });

  it('saves a validated recovered key and delegates deletion', async () => {
    const store = createStore(null);
    const manager = new BackupKeyManager({
      generator: { generateKey: vi.fn() },
      idFactory: () => keyId,
      store,
    });

    await manager.saveRecovered(record());
    await manager.delete();

    expect(store.save).toHaveBeenCalledWith(record());
    expect(store.delete).toHaveBeenCalledTimes(1);
  });
});

function record(): BackupKeyRecord {
  return { key: Uint8Array.from(key), keyId, keyVersion: 1 };
}

function createStore(existing: BackupKeyRecord | null): BackupKeyStore & {
  delete: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
} {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(existing),
    save: vi.fn().mockResolvedValue(undefined),
  };
}
