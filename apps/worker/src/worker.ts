// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { PgBoss, type Job } from 'pg-boss';
import { z } from 'zod';

export const readinessQueueName = 'reimbursd-system-readiness-v1';

const readinessJobSchema = z
  .object({
    probeId: z.string().uuid(),
    schemaVersion: z.literal(1),
  })
  .strict();

export type ReadinessJob = z.infer<typeof readinessJobSchema>;

export interface WorkerRuntime {
  readonly readiness: Promise<ReadinessJob>;
  readonly readinessJobId: string;
  stop(): Promise<void>;
}

export interface StartWorkerOptions {
  readonly boss?: PgBoss;
  readonly databaseUrl: string;
  readonly onQueueError?: () => void;
  readonly probeId?: string;
}

export class WorkerStartupError extends Error {
  constructor() {
    super('The worker could not initialize its durable queue.');
    this.name = 'WorkerStartupError';
  }
}

export class WorkerJobValidationError extends Error {
  constructor() {
    super('worker_job_invalid');
    this.name = 'WorkerJobValidationError';
  }
}

export async function startWorker(options: StartWorkerOptions): Promise<WorkerRuntime> {
  const boss =
    options.boss ??
    new PgBoss({
      application_name: 'reimbursd-worker',
      connectionString: options.databaseUrl,
      connectionTimeoutMillis: 5_000,
      max: 5,
      schedule: false,
      schema: 'reimbursd_jobs',
      useListenNotify: true,
    });
  const probe = parseReadinessJob({
    probeId: options.probeId ?? randomUUID(),
    schemaVersion: 1,
  });
  let queueStarted = false;
  let stopped = false;
  let resolveReadiness: (job: ReadinessJob) => void = () => undefined;
  const readiness = new Promise<ReadinessJob>((resolve) => {
    resolveReadiness = resolve;
  });

  boss.on('error', () => options.onQueueError?.());

  try {
    await boss.start();
    queueStarted = true;
    await boss.createQueue(readinessQueueName, {
      deleteAfterSeconds: 60,
      expireInSeconds: 30,
      notify: true,
      retentionSeconds: 300,
      retryLimit: 0,
    });
    await boss.work<unknown>(
      readinessQueueName,
      {
        batchSize: 1,
        localConcurrency: 1,
        notifyPollingIntervalSeconds: 30,
        pollingIntervalSeconds: 2,
      },
      async (jobs) => handleReadinessJobs(jobs, probe.probeId, resolveReadiness),
    );
    const readinessJobId = await boss.send(readinessQueueName, probe);

    if (!readinessJobId) {
      throw new WorkerStartupError();
    }

    return {
      readiness,
      readinessJobId,
      async stop() {
        if (stopped) {
          return;
        }

        stopped = true;
        await boss.stop({ close: true, graceful: true, timeout: 30_000 });
      },
    };
  } catch (error) {
    if (queueStarted) {
      try {
        await boss.stop({ close: true, graceful: true, timeout: 30_000 });
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Worker startup and queue cleanup both failed.',
        );
      }
    }

    if (error instanceof WorkerStartupError) {
      throw error;
    }

    throw new WorkerStartupError();
  }
}

export function parseReadinessJob(value: unknown): ReadinessJob {
  const result = readinessJobSchema.safeParse(value);

  if (!result.success) {
    throw new WorkerJobValidationError();
  }

  return result.data;
}

async function handleReadinessJobs(
  jobs: Job<unknown>[],
  startupProbeId: string,
  resolveReadiness: (job: ReadinessJob) => void,
): Promise<{ readonly schemaVersion: 1; readonly status: 'ok' }> {
  const [job] = jobs;

  if (jobs.length !== 1 || !job) {
    throw new WorkerJobValidationError();
  }

  const data = parseReadinessJob(job.data);

  if (data.probeId === startupProbeId) {
    resolveReadiness(data);
  }

  return { schemaVersion: 1, status: 'ok' };
}
