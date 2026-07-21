// SPDX-License-Identifier: GPL-3.0-only
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { ReceiptDocumentMimeType } from '@reimbursd/domain';

export interface HostedObjectStorage {
  assertReady(): Promise<void>;
  delete(storageReference: string): Promise<void>;
  read(storageReference: string, maximumByteSize: number): Promise<Uint8Array>;
  writeOnce(
    storageReference: string,
    bytes: Uint8Array,
    mimeType: ReceiptDocumentMimeType,
    sha256: string,
  ): Promise<void>;
}

export class HostedObjectAlreadyExistsError extends Error {
  constructor() {
    super('The hosted object already exists.');
    this.name = 'HostedObjectAlreadyExistsError';
  }
}

export class HostedObjectLimitError extends Error {
  constructor() {
    super('The hosted object exceeds the configured byte limit.');
    this.name = 'HostedObjectLimitError';
  }
}

export interface S3CompatibleObjectStorageOptions {
  readonly bucket: string;
  readonly client: S3Client;
}

export class S3CompatibleObjectStorage implements HostedObjectStorage {
  readonly #bucket: string;
  readonly #client: S3Client;

  constructor(options: S3CompatibleObjectStorageOptions) {
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(options.bucket)) {
      throw new TypeError('Object-storage bucket name is invalid.');
    }

    this.#bucket = options.bucket;
    this.#client = options.client;
  }

  async assertReady(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  async writeOnce(
    storageReference: string,
    bytes: Uint8Array,
    mimeType: ReceiptDocumentMimeType,
    sha256: string,
  ): Promise<void> {
    assertStorageReference(storageReference);
    assertSha256(sha256);

    try {
      await this.#client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: this.#bucket,
          ChecksumSHA256: Buffer.from(sha256, 'hex').toString('base64'),
          ContentLength: bytes.byteLength,
          ContentType: mimeType,
          IfNoneMatch: '*',
          Key: storageReference,
          Metadata: { sha256 },
        }),
      );
    } catch (error) {
      if (isPreconditionFailure(error)) {
        throw new HostedObjectAlreadyExistsError();
      }

      throw error;
    }
  }

  async read(storageReference: string, maximumByteSize: number): Promise<Uint8Array> {
    assertStorageReference(storageReference);

    if (!Number.isSafeInteger(maximumByteSize) || maximumByteSize <= 0) {
      throw new RangeError('Maximum object byte size must be a positive safe integer.');
    }

    const response = await this.#client.send(
      new GetObjectCommand({ Bucket: this.#bucket, Key: storageReference }),
    );

    if ((response.ContentLength ?? 0) > maximumByteSize) {
      destroyBody(response.Body);
      throw new HostedObjectLimitError();
    }

    if (!response.Body) {
      throw new Error('Object storage returned no response body.');
    }

    const bytes = await readBoundedBody(response.Body, maximumByteSize);

    if (bytes.byteLength === 0 || bytes.byteLength > maximumByteSize) {
      throw new HostedObjectLimitError();
    }

    return bytes;
  }

  async delete(storageReference: string): Promise<void> {
    assertStorageReference(storageReference);
    await this.#client.send(
      new DeleteObjectCommand({ Bucket: this.#bucket, Key: storageReference }),
    );
  }
}

async function readBoundedBody(body: object, maximumByteSize: number): Promise<Uint8Array> {
  if (!(Symbol.asyncIterator in body)) {
    destroyBody(body);
    throw new Error('Object storage returned a non-streaming response body.');
  }

  const chunks: Uint8Array[] = [];
  let byteSize = 0;

  for await (const chunk of body as AsyncIterable<unknown>) {
    if (!(chunk instanceof Uint8Array)) {
      destroyBody(body);
      throw new Error('Object storage returned an invalid response body chunk.');
    }

    byteSize += chunk.byteLength;

    if (byteSize > maximumByteSize) {
      destroyBody(body);
      throw new HostedObjectLimitError();
    }

    chunks.push(chunk);
  }

  return Uint8Array.from(Buffer.concat(chunks, byteSize));
}

function destroyBody(body: object | undefined): void {
  if (body && 'destroy' in body && typeof body.destroy === 'function') {
    body.destroy();
  }
}

function assertStorageReference(value: string): void {
  if (
    value.length === 0 ||
    value.length > 1_024 ||
    value.startsWith('/') ||
    value.includes('..') ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new TypeError('Object storage reference is invalid.');
  }
}

function assertSha256(value: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError('SHA-256 must contain 64 lowercase hexadecimal characters.');
  }
}

function isPreconditionFailure(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const statusCode =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? error.$metadata.httpStatusCode
      : null;
  return ('name' in error && error.name === 'PreconditionFailed') || statusCode === 412;
}
