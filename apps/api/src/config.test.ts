// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readApiConfig } from './config.js';

const testSecret = 'test-only-api-secret-that-is-at-least-32-characters';

describe('readApiConfig', () => {
  it('uses loopback and conservative defaults', () => {
    expect(
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
      }),
    ).toEqual({
      databaseUrl: null,
      developmentAuthEnabled: false,
      host: '127.0.0.1',
      jwtSecret: testSecret,
      nodeEnvironment: 'test',
      objectStorage: null,
      port: 3000,
    });
  });

  it('requires signing material of at least 32 characters', () => {
    expect(() => readApiConfig({ NODE_ENV: 'test' })).toThrow();
    expect(() =>
      readApiConfig({ NODE_ENV: 'test', REIMBURSD_API_JWT_SECRET: 'too-short' }),
    ).toThrow();
  });

  it('rejects development identity issuance in production', () => {
    expect(() =>
      readApiConfig({
        NODE_ENV: 'production',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_DEV_AUTH_ENABLED: 'true',
      }),
    ).toThrow('Development authentication cannot be enabled in production.');
  });

  it('requires PostgreSQL in production', () => {
    expect(() =>
      readApiConfig({
        NODE_ENV: 'production',
        REIMBURSD_API_JWT_SECRET: testSecret,
      }),
    ).toThrow('Production API configuration requires PostgreSQL.');

    expect(
      readApiConfig({
        NODE_ENV: 'production',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_DATABASE_URL: 'postgresql://reimbursd.invalid/reimbursd',
      }).databaseUrl,
    ).toBe('postgresql://reimbursd.invalid/reimbursd');
  });

  it('rejects non-PostgreSQL database URLs', () => {
    expect(() =>
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_DATABASE_URL: 'https://database.invalid/reimbursd',
      }),
    ).toThrow();
  });

  it('requires complete object-storage configuration and PostgreSQL metadata', () => {
    expect(() =>
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_OBJECT_ENDPOINT: 'http://127.0.0.1:9000',
      }),
    ).toThrow();

    expect(() =>
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_OBJECT_ACCESS_KEY_ID: 'test-access',
        REIMBURSD_OBJECT_BUCKET: 'reimbursd-receipts',
        REIMBURSD_OBJECT_ENDPOINT: 'http://127.0.0.1:9000',
        REIMBURSD_OBJECT_REGION: 'us-east-1',
        REIMBURSD_OBJECT_SECRET_ACCESS_KEY: 'synthetic-test-secret',
      }),
    ).toThrow('Object storage requires PostgreSQL metadata storage.');
  });

  it('parses a complete S3-compatible configuration without exposing defaults', () => {
    expect(
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_DATABASE_URL: 'postgresql://reimbursd.invalid/reimbursd',
        REIMBURSD_OBJECT_ACCESS_KEY_ID: 'test-access',
        REIMBURSD_OBJECT_BUCKET: 'reimbursd-receipts',
        REIMBURSD_OBJECT_ENDPOINT: 'http://127.0.0.1:9000',
        REIMBURSD_OBJECT_REGION: 'us-east-1',
        REIMBURSD_OBJECT_SECRET_ACCESS_KEY: 'synthetic-test-secret',
      }).objectStorage,
    ).toEqual({
      accessKeyId: 'test-access',
      bucket: 'reimbursd-receipts',
      endpoint: 'http://127.0.0.1:9000',
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'synthetic-test-secret',
    });
  });

  it('rejects invalid ports', () => {
    expect(() =>
      readApiConfig({
        NODE_ENV: 'test',
        REIMBURSD_API_JWT_SECRET: testSecret,
        REIMBURSD_API_PORT: '0',
      }),
    ).toThrow();
  });
});
