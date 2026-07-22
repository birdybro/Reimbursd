// SPDX-License-Identifier: GPL-3.0-only
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  parseReadinessJob,
  readinessQueueName,
  startWorker,
  WorkerJobValidationError,
} from './worker.js';

const probeA = '40000000-0000-4000-8000-000000000001';
const probeB = '40000000-0000-4000-8000-000000000002';
let connectionString = '';
let container: StartedPostgreSqlContainer | null = null;

describe('worker readiness boundary', () => {
  it('strictly validates versioned non-user-data jobs', () => {
    expect(parseReadinessJob({ probeId: probeA, schemaVersion: 1 })).toEqual({
      probeId: probeA,
      schemaVersion: 1,
    });
    expect(() => parseReadinessJob({ probeId: probeA, schemaVersion: 2 })).toThrow(
      WorkerJobValidationError,
    );
    expect(() =>
      parseReadinessJob({
        merchantName: 'Must not be accepted',
        probeId: probeA,
        schemaVersion: 1,
      }),
    ).toThrow(WorkerJobValidationError);
  });
});

describe.sequential('PostgreSQL worker lifecycle', () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('reimbursd_worker_test')
      .withUsername('reimbursd_worker_test')
      .withPassword('synthetic-test-password')
      .start();
    connectionString = container.getConnectionUri();
  }, 60_000);

  afterAll(async () => {
    if (container) {
      await container.stop();
      container = null;
    }
  }, 30_000);

  it('delivers, validates, completes, stops, and restarts durable jobs', async () => {
    const firstBoss = createTestBoss();
    const first = await startWorker({
      boss: firstBoss,
      databaseUrl: connectionString,
      probeId: probeA,
    });
    const firstSpy = firstBoss.getSpy<unknown>(readinessQueueName);

    await expect(first.readiness).resolves.toEqual({ probeId: probeA, schemaVersion: 1 });
    await expect(
      firstSpy.waitForJobWithId(first.readinessJobId, 'completed'),
    ).resolves.toMatchObject({
      data: { probeId: probeA, schemaVersion: 1 },
      output: { schemaVersion: 1, status: 'ok' },
    });
    await first.stop();
    await first.stop();

    const secondBoss = createTestBoss();
    const second = await startWorker({
      boss: secondBoss,
      databaseUrl: connectionString,
      probeId: probeB,
    });
    const secondSpy = secondBoss.getSpy<unknown>(readinessQueueName);

    try {
      await expect(second.readiness).resolves.toEqual({ probeId: probeB, schemaVersion: 1 });
      await expect(
        secondSpy.waitForJobWithId(second.readinessJobId, 'completed'),
      ).resolves.toMatchObject({ data: { probeId: probeB, schemaVersion: 1 } });

      const invalidId = await secondBoss.send(readinessQueueName, {
        privateMarker: 'SENSITIVE_MARKER',
        probeId: probeA,
        schemaVersion: 2,
      });
      expect(invalidId).not.toBeNull();
      const invalidJob = await secondSpy.waitForJobWithId(invalidId ?? '', 'failed');
      expect(JSON.stringify(invalidJob.output)).toContain('worker_job_invalid');
      expect(JSON.stringify(invalidJob.output)).not.toContain('SENSITIVE_MARKER');
    } finally {
      await second.stop();
    }
  });
});

function createTestBoss(): PgBoss {
  return new PgBoss({
    __test__enableSpies: true,
    application_name: 'reimbursd-worker-test',
    connectionString,
    max: 5,
    schedule: false,
    schema: 'reimbursd_jobs',
    useListenNotify: true,
  });
}
