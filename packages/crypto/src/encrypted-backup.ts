// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod';

const magic = encodeAscii('REIMBURSD-BACKUP\n');
const headerLengthByteSize = 4;
const framingByteSize = magic.byteLength + headerLengthByteSize;
const nonceByteSize = 12;
const tagByteSize = 16;
const offsetDateTimePattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const recoveryKeyPattern = /^RBK1(?:-[0-9A-F]{8}){8}$/;

export const encryptedBackupFormatVersion = 1;
export const encryptedBackupKeyByteSize = 32;

export interface EncryptedBackupLimits {
  readonly maxEnvelopeByteSize: number;
  readonly maxHeaderByteSize: number;
  readonly maxPlaintextByteSize: number;
}

export const defaultEncryptedBackupLimits: EncryptedBackupLimits = {
  maxEnvelopeByteSize: 1024 * 1024 * 1024 + 8192,
  maxHeaderByteSize: 4096,
  maxPlaintextByteSize: 1024 * 1024 * 1024,
};

export interface AuthenticatedCiphertext {
  readonly ciphertext: Uint8Array;
  readonly nonce: Uint8Array;
  readonly tag: Uint8Array;
}

export interface EncryptedBackupCryptoProvider {
  decrypt(input: {
    readonly additionalData: Uint8Array;
    readonly ciphertext: Uint8Array;
    readonly key: Uint8Array;
    readonly nonce: Uint8Array;
    readonly tag: Uint8Array;
  }): Promise<Uint8Array>;
  encrypt(input: {
    readonly additionalData: Uint8Array;
    readonly key: Uint8Array;
    readonly plaintext: Uint8Array;
  }): Promise<AuthenticatedCiphertext>;
}

export interface EncryptedBackupManifest {
  readonly algorithm: 'AES-256-GCM';
  readonly ciphertextByteSize: number;
  readonly createdAt: string;
  readonly format: 'reimbursd-encrypted-backup';
  readonly formatVersion: typeof encryptedBackupFormatVersion;
  readonly keyId: string;
  readonly keyVersion: 1;
  readonly nonceByteSize: typeof nonceByteSize;
  readonly plaintextByteSize: number;
  readonly tagByteSize: typeof tagByteSize;
}

export interface EncryptedBackupArchive {
  readonly bytes: Uint8Array;
  readonly filename: string;
  readonly manifest: EncryptedBackupManifest;
}

export interface OpenedEncryptedBackup {
  readonly manifest: EncryptedBackupManifest;
  readonly plaintext: Uint8Array;
}

export class EncryptedBackupValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncryptedBackupValidationError';
  }
}

export class EncryptedBackupAuthenticationError extends Error {
  constructor() {
    super('Encrypted backup authentication failed.');
    this.name = 'EncryptedBackupAuthenticationError';
  }
}

const manifestSchema: z.ZodType<EncryptedBackupManifest> = z
  .object({
    algorithm: z.literal('AES-256-GCM'),
    ciphertextByteSize: z.number(),
    createdAt: z.string(),
    format: z.literal('reimbursd-encrypted-backup'),
    formatVersion: z.literal(encryptedBackupFormatVersion),
    keyId: z.string(),
    keyVersion: z.literal(1),
    nonceByteSize: z.literal(nonceByteSize),
    plaintextByteSize: z.number(),
    tagByteSize: z.literal(tagByteSize),
  })
  .strict();

export async function createEncryptedBackup({
  createdAt,
  crypto,
  key,
  keyId,
  limits = defaultEncryptedBackupLimits,
  plaintext,
}: {
  readonly createdAt: string;
  readonly crypto: EncryptedBackupCryptoProvider;
  readonly key: Uint8Array;
  readonly keyId: string;
  readonly limits?: EncryptedBackupLimits;
  readonly plaintext: Uint8Array;
}): Promise<EncryptedBackupArchive> {
  assertLimits(limits);
  assertKey(key);

  if (plaintext.byteLength < 1 || plaintext.byteLength > limits.maxPlaintextByteSize) {
    throw new EncryptedBackupValidationError('Encrypted backup plaintext size is invalid.');
  }

  const manifest: EncryptedBackupManifest = {
    algorithm: 'AES-256-GCM',
    ciphertextByteSize: plaintext.byteLength,
    createdAt,
    format: 'reimbursd-encrypted-backup',
    formatVersion: encryptedBackupFormatVersion,
    keyId,
    keyVersion: 1,
    nonceByteSize,
    plaintextByteSize: plaintext.byteLength,
    tagByteSize,
  };
  assertManifest(manifest);
  const header = encodeAscii(JSON.stringify(manifest));
  assertHeaderSize(header, limits);
  assertExpectedEnvelopeSize(manifest, header.byteLength, limits);
  const sealed = await crypto.encrypt({
    additionalData: Uint8Array.from(header),
    key: Uint8Array.from(key),
    plaintext: Uint8Array.from(plaintext),
  });
  assertSealedData(sealed, manifest);

  return {
    bytes: frameBackup(header, sealed),
    filename: `reimbursd-backup-${createdAt.slice(0, 10)}.rbd`,
    manifest,
  };
}

export async function openEncryptedBackup({
  bytes,
  crypto,
  key,
  limits = defaultEncryptedBackupLimits,
}: {
  readonly bytes: Uint8Array;
  readonly crypto: EncryptedBackupCryptoProvider;
  readonly key: Uint8Array;
  readonly limits?: EncryptedBackupLimits;
}): Promise<OpenedEncryptedBackup> {
  assertLimits(limits);
  assertKey(key);
  const parsed = parseEnvelope(bytes, limits);
  let plaintext: Uint8Array;

  try {
    plaintext = await crypto.decrypt({
      additionalData: Uint8Array.from(parsed.header),
      ciphertext: Uint8Array.from(parsed.ciphertext),
      key: Uint8Array.from(key),
      nonce: Uint8Array.from(parsed.nonce),
      tag: Uint8Array.from(parsed.tag),
    });
  } catch {
    throw new EncryptedBackupAuthenticationError();
  }

  if (plaintext.byteLength !== parsed.manifest.plaintextByteSize) {
    throw new EncryptedBackupAuthenticationError();
  }

  return { manifest: parsed.manifest, plaintext: Uint8Array.from(plaintext) };
}

export function formatBackupRecoveryKey(key: Uint8Array): string {
  assertKey(key);
  const hexadecimal = Array.from(key, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
  return `RBK1-${hexadecimal.match(/.{8}/g)?.join('-') ?? ''}`;
}

export function parseBackupRecoveryKey(value: string): Uint8Array {
  const canonical = value.trim().toUpperCase();

  if (!recoveryKeyPattern.test(canonical)) {
    throw new EncryptedBackupValidationError('Backup recovery key format is invalid.');
  }

  const hexadecimal = canonical.slice(5).replaceAll('-', '');
  const key = new Uint8Array(encryptedBackupKeyByteSize);

  for (let index = 0; index < key.byteLength; index += 1) {
    key[index] = Number.parseInt(hexadecimal.slice(index * 2, index * 2 + 2), 16);
  }

  return key;
}

function parseEnvelope(
  bytes: Uint8Array,
  limits: EncryptedBackupLimits,
): {
  readonly ciphertext: Uint8Array;
  readonly header: Uint8Array;
  readonly manifest: EncryptedBackupManifest;
  readonly nonce: Uint8Array;
  readonly tag: Uint8Array;
} {
  if (
    bytes.byteLength < framingByteSize + nonceByteSize + tagByteSize + 1 ||
    bytes.byteLength > limits.maxEnvelopeByteSize ||
    !magic.every((byte, index) => bytes[index] === byte)
  ) {
    throw new EncryptedBackupValidationError('Encrypted backup envelope is invalid.');
  }

  const headerLength = readUint32(bytes, magic.byteLength);

  if (headerLength < 1 || headerLength > limits.maxHeaderByteSize) {
    throw new EncryptedBackupValidationError('Encrypted backup header size is invalid.');
  }

  const headerStart = framingByteSize;
  const headerEnd = headerStart + headerLength;

  if (headerEnd > bytes.byteLength) {
    throw new EncryptedBackupValidationError('Encrypted backup is truncated.');
  }

  const header = bytes.slice(headerStart, headerEnd);
  const manifest = parseManifest(header);
  assertExpectedEnvelopeSize(manifest, headerLength, limits);
  const expectedSize =
    framingByteSize +
    headerLength +
    manifest.nonceByteSize +
    manifest.ciphertextByteSize +
    manifest.tagByteSize;

  if (bytes.byteLength !== expectedSize) {
    throw new EncryptedBackupValidationError('Encrypted backup payload size is inconsistent.');
  }

  const nonceEnd = headerEnd + manifest.nonceByteSize;
  const ciphertextEnd = nonceEnd + manifest.ciphertextByteSize;

  return {
    ciphertext: bytes.slice(nonceEnd, ciphertextEnd),
    header,
    manifest,
    nonce: bytes.slice(headerEnd, nonceEnd),
    tag: bytes.slice(ciphertextEnd),
  };
}

function parseManifest(header: Uint8Array): EncryptedBackupManifest {
  let parsed: unknown;

  try {
    parsed = JSON.parse(decodeAscii(header));
  } catch {
    throw new EncryptedBackupValidationError('Encrypted backup header is invalid.');
  }

  const result = manifestSchema.safeParse(parsed);

  if (!result.success) {
    throw new EncryptedBackupValidationError('Encrypted backup header is invalid.');
  }

  assertManifest(result.data);
  return result.data;
}

function assertManifest(manifest: EncryptedBackupManifest): void {
  if (
    !offsetDateTimePattern.test(manifest.createdAt) ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    !uuidPattern.test(manifest.keyId) ||
    !Number.isSafeInteger(manifest.plaintextByteSize) ||
    manifest.plaintextByteSize < 1 ||
    !Number.isSafeInteger(manifest.ciphertextByteSize) ||
    manifest.ciphertextByteSize !== manifest.plaintextByteSize
  ) {
    throw new EncryptedBackupValidationError('Encrypted backup metadata is invalid.');
  }
}

function assertSealedData(
  sealed: AuthenticatedCiphertext,
  manifest: EncryptedBackupManifest,
): void {
  if (
    sealed.nonce.byteLength !== manifest.nonceByteSize ||
    sealed.ciphertext.byteLength !== manifest.ciphertextByteSize ||
    sealed.tag.byteLength !== manifest.tagByteSize
  ) {
    throw new EncryptedBackupValidationError('Encryption provider returned invalid sealed data.');
  }
}

function frameBackup(header: Uint8Array, sealed: AuthenticatedCiphertext): Uint8Array {
  const result = new Uint8Array(
    framingByteSize +
      header.byteLength +
      sealed.nonce.byteLength +
      sealed.ciphertext.byteLength +
      sealed.tag.byteLength,
  );
  result.set(magic, 0);
  writeUint32(result, magic.byteLength, header.byteLength);
  let offset = framingByteSize;

  for (const section of [header, sealed.nonce, sealed.ciphertext, sealed.tag]) {
    result.set(section, offset);
    offset += section.byteLength;
  }

  return result;
}

function assertExpectedEnvelopeSize(
  manifest: EncryptedBackupManifest,
  headerByteSize: number,
  limits: EncryptedBackupLimits,
): void {
  if (manifest.plaintextByteSize > limits.maxPlaintextByteSize) {
    throw new EncryptedBackupValidationError('Encrypted backup plaintext exceeds its size limit.');
  }

  const expected =
    framingByteSize +
    headerByteSize +
    manifest.nonceByteSize +
    manifest.ciphertextByteSize +
    manifest.tagByteSize;

  if (!Number.isSafeInteger(expected) || expected > limits.maxEnvelopeByteSize) {
    throw new EncryptedBackupValidationError('Encrypted backup envelope exceeds its size limit.');
  }
}

function assertHeaderSize(header: Uint8Array, limits: EncryptedBackupLimits): void {
  if (header.byteLength < 1 || header.byteLength > limits.maxHeaderByteSize) {
    throw new EncryptedBackupValidationError('Encrypted backup header size is invalid.');
  }
}

function assertLimits(limits: EncryptedBackupLimits): void {
  if (
    Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1) ||
    limits.maxHeaderByteSize > limits.maxEnvelopeByteSize ||
    limits.maxPlaintextByteSize > limits.maxEnvelopeByteSize
  ) {
    throw new TypeError('Encrypted backup limits are invalid.');
  }
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== encryptedBackupKeyByteSize) {
    throw new EncryptedBackupValidationError('Backup encryption key size is invalid.');
  }
}

function encodeAscii(value: string): Uint8Array {
  const result = new Uint8Array(value.length);

  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);

    if (code > 0x7f) {
      throw new EncryptedBackupValidationError('Encrypted backup header must be ASCII.');
    }

    result[index] = code;
  }

  return result;
}

function decodeAscii(value: Uint8Array): string {
  let result = '';

  for (const byte of value) {
    if (byte > 0x7f) {
      throw new EncryptedBackupValidationError('Encrypted backup header must be ASCII.');
    }

    result += String.fromCharCode(byte);
  }

  return result;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] ?? 0) * 0x1000000 +
      (bytes[offset + 1] ?? 0) * 0x10000 +
      (bytes[offset + 2] ?? 0) * 0x100 +
      (bytes[offset + 3] ?? 0)) >>>
    0
  );
}

function writeUint32(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = (value >>> 24) & 0xff;
  bytes[offset + 1] = (value >>> 16) & 0xff;
  bytes[offset + 2] = (value >>> 8) & 0xff;
  bytes[offset + 3] = value & 0xff;
}
