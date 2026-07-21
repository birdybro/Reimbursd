// SPDX-License-Identifier: GPL-3.0-only
import { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import {
  HostedObjectAlreadyExistsError,
  HostedObjectLimitError,
  S3CompatibleObjectStorage,
} from './object-storage.js';

const storageReference =
  'owners/00000000-0000-4000-8000-000000000001/receipts/' +
  '10000000-0000-4000-8000-000000000001/originals/' +
  '30000000-0000-4000-8000-000000000001.png';
const sha256 = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

function createStorage(send: (command: object) => Promise<unknown>): S3CompatibleObjectStorage {
  const client = { send } as unknown as S3Client;
  return new S3CompatibleObjectStorage({ bucket: 'reimbursd-test', client });
}

describe('S3CompatibleObjectStorage', () => {
  it('reads a streaming response within the configured bound', async () => {
    const body = Readable.from([Uint8Array.from([1, 2]), Uint8Array.from([3, 4])]);
    const storage = createStorage(async () => ({ Body: body, ContentLength: 4 }));

    await expect(storage.read(storageReference, 4)).resolves.toEqual(Uint8Array.from([1, 2, 3, 4]));
  });

  it('destroys a response whose declared length exceeds the bound', async () => {
    const body = Readable.from([Uint8Array.from([1, 2, 3, 4, 5])]);
    const destroy = vi.spyOn(body, 'destroy');
    const storage = createStorage(async () => ({ Body: body, ContentLength: 5 }));

    await expect(storage.read(storageReference, 4)).rejects.toBeInstanceOf(HostedObjectLimitError);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('stops an unbounded response as soon as streamed bytes exceed the bound', async () => {
    const body = Readable.from([Uint8Array.from([1, 2]), Uint8Array.from([3, 4, 5])]);
    const destroy = vi.spyOn(body, 'destroy');
    const storage = createStorage(async () => ({ Body: body }));

    await expect(storage.read(storageReference, 4)).rejects.toBeInstanceOf(HostedObjectLimitError);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it('maps conditional-write conflicts without exposing provider errors', async () => {
    const storage = createStorage(async () => {
      throw { name: 'PreconditionFailed', $metadata: { httpStatusCode: 412 } };
    });

    await expect(
      storage.writeOnce(storageReference, Uint8Array.from([1]), 'image/png', sha256),
    ).rejects.toBeInstanceOf(HostedObjectAlreadyExistsError);
  });
});
