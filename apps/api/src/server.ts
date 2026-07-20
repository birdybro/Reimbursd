// SPDX-License-Identifier: GPL-3.0-only
import { buildApi } from './app.js';
import { readApiConfig } from './config.js';
import { migrateHostedDatabase } from './postgres-migrations.js';
import { PostgresHostedReceiptRepository } from './postgres-receipt-repository.js';
import { Pool } from 'pg';

async function start(): Promise<void> {
  let pool: Pool | null = null;

  try {
    const config = readApiConfig(process.env);
    let repository;

    if (config.databaseUrl) {
      pool = new Pool({
        connectionString: config.databaseUrl,
        connectionTimeoutMillis: 5_000,
        max: 10,
      });
      await migrateHostedDatabase(pool);
      repository = new PostgresHostedReceiptRepository(pool);
    }

    const app = await buildApi({
      config,
      ...(pool ? { onClose: async () => pool?.end(), storage: 'postgresql' as const } : {}),
      ...(repository ? { repository } : {}),
    });
    await app.listen({ host: config.host, port: config.port });

    let shuttingDown = false;
    const shutDown = (): void => {
      if (shuttingDown) {
        return;
      }

      shuttingDown = true;
      void app.close().catch(() => {
        process.stderr.write('Reimbursd API shutdown failed.\n');
        process.exitCode = 1;
      });
    };
    process.once('SIGINT', shutDown);
    process.once('SIGTERM', shutDown);
  } catch {
    if (pool) {
      try {
        await pool.end();
      } catch {
        process.stderr.write('Reimbursd API database cleanup failed.\n');
      }
    }

    process.stderr.write('Reimbursd API failed to start. Check the server configuration.\n');
    process.exitCode = 1;
  }
}

await start();
