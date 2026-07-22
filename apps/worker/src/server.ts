// SPDX-License-Identifier: GPL-3.0-only
import { readWorkerConfig } from './config.js';
import { startWorker, type WorkerRuntime } from './worker.js';

async function start(): Promise<void> {
  let runtime: WorkerRuntime | null = null;

  try {
    const config = readWorkerConfig(process.env);
    runtime = await startWorker({
      databaseUrl: config.databaseUrl,
      onQueueError: () => process.stderr.write('Reimbursd worker queue error.\n'),
    });
    let shuttingDown = false;
    const shutDown = (): void => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      void runtime?.stop().catch(() => {
        process.stderr.write('Reimbursd worker shutdown failed.\n');
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', shutDown);
    process.once('SIGTERM', shutDown);
    await runtime.readiness;
    process.stdout.write('Reimbursd worker ready.\n');
  } catch {
    if (runtime) {
      try {
        await runtime.stop();
      } catch {
        process.stderr.write('Reimbursd worker cleanup failed.\n');
      }
    }

    process.stderr.write('Reimbursd worker failed to start. Check the worker configuration.\n');
    process.exitCode = 1;
  }
}

await start();
