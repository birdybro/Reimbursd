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
      developmentAuthEnabled: false,
      host: '127.0.0.1',
      jwtSecret: testSecret,
      nodeEnvironment: 'test',
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
