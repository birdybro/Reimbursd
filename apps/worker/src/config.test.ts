// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it } from 'vitest';
import { readWorkerConfig } from './config.js';

describe('worker configuration', () => {
  it('requires a PostgreSQL URL', () => {
    expect(() => readWorkerConfig({ NODE_ENV: 'test' })).toThrow();
    expect(() =>
      readWorkerConfig({ NODE_ENV: 'test', REIMBURSD_DATABASE_URL: 'https://database.invalid' }),
    ).toThrow();
  });

  it('accepts explicit PostgreSQL configuration', () => {
    expect(
      readWorkerConfig({
        NODE_ENV: 'test',
        REIMBURSD_DATABASE_URL:
          'postgresql://reimbursd:synthetic-password@127.0.0.1:5432/reimbursd',
      }),
    ).toEqual({
      databaseUrl: 'postgresql://reimbursd:synthetic-password@127.0.0.1:5432/reimbursd',
      nodeEnvironment: 'test',
    });
  });
});
