// SPDX-License-Identifier: GPL-3.0-only
import { createHash } from 'node:crypto';
import {
  CreateBucketCommand,
  GetBucketAclCommand,
  GetBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { MinioContainer, type StartedMinioContainer } from '@testcontainers/minio';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  HostedObjectAlreadyExistsError,
  HostedObjectLimitError,
  S3CompatibleObjectStorage,
} from './object-storage.js';

const bucket = 'reimbursd-integration';
const image = 'minio/minio:RELEASE.2025-09-07T16-13-09Z';
const username = 'reimbursd_test';
const password = 'synthetic-test-password';
const onePixelPng = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 4, 0, 0,
  0, 181, 28, 12, 2, 0, 0, 0, 11, 73, 68, 65, 84, 120, 218, 99, 100, 248, 15, 0, 1, 5, 1, 1, 39, 24,
  227, 102, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
]);
const storageReference =
  'owners/00000000-0000-4000-8000-000000000001/receipts/' +
  '10000000-0000-4000-8000-000000000001/originals/' +
  '30000000-0000-4000-8000-000000000001.png';

let client: S3Client | null = null;
let container: StartedMinioContainer | null = null;
let storage: S3CompatibleObjectStorage | null = null;

function requireStorage(): S3CompatibleObjectStorage {
  if (!storage) {
    throw new Error('MinIO test storage is not initialized.');
  }

  return storage;
}

function requireClient(): S3Client {
  if (!client) {
    throw new Error('MinIO test client is not initialized.');
  }

  return client;
}

describe.sequential('S3-compatible private object storage', () => {
  beforeAll(async () => {
    container = await new MinioContainer(image)
      .withUsername(username)
      .withPassword(password)
      .start();
    client = new S3Client({
      credentials: { accessKeyId: username, secretAccessKey: password },
      endpoint: container.getConnectionUrl(),
      forcePathStyle: true,
      region: 'us-east-1',
    });
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    storage = new S3CompatibleObjectStorage({ bucket, client });
  }, 60_000);

  afterAll(async () => {
    client?.destroy();
    client = null;
    storage = null;

    if (container) {
      await container.stop();
      container = null;
    }
  }, 30_000);

  it('creates a private bucket with no anonymous policy or grants', async () => {
    await expect(requireStorage().assertReady()).resolves.toBeUndefined();
    await expect(
      requireClient().send(new GetBucketPolicyCommand({ Bucket: bucket })),
    ).rejects.toMatchObject({ name: 'NoSuchBucketPolicy' });
    const acl = await requireClient().send(new GetBucketAclCommand({ Bucket: bucket }));
    const publicGrant = acl.Grants?.find(({ Grantee }) =>
      Grantee?.URI?.includes('http://acs.amazonaws.com/groups/global/'),
    );
    expect(publicGrant).toBeUndefined();
  });

  it('writes once and round-trips bytes through the real adapter', async () => {
    const sha256 = createHash('sha256').update(onePixelPng).digest('hex');
    const adapter = requireStorage();
    await adapter.writeOnce(storageReference, onePixelPng, 'image/png', sha256);

    await expect(adapter.read(storageReference, onePixelPng.byteLength)).resolves.toEqual(
      onePixelPng,
    );
    await expect(
      adapter.writeOnce(storageReference, onePixelPng, 'image/png', sha256),
    ).rejects.toBeInstanceOf(HostedObjectAlreadyExistsError);
    await expect(adapter.read(storageReference, onePixelPng.byteLength - 1)).rejects.toBeInstanceOf(
      HostedObjectLimitError,
    );
  });
});
