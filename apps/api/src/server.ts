// SPDX-License-Identifier: GPL-3.0-only
import { S3Client } from '@aws-sdk/client-s3';
import { PdfLibAttachmentInspector } from '@reimbursd/attachments';
import { Pool } from 'pg';
import { buildApi } from './app.js';
import { readApiConfig } from './config.js';
import { HostedAttachmentService } from './hosted-attachment-service.js';
import { PostgresHostedReceiptDocumentRepository } from './hosted-receipt-document-repository.js';
import { S3CompatibleObjectStorage } from './object-storage.js';
import { migrateHostedDatabase } from './postgres-migrations.js';
import { PostgresHostedReceiptRepository } from './postgres-receipt-repository.js';

async function start(): Promise<void> {
  let objectClient: S3Client | null = null;
  let pool: Pool | null = null;

  try {
    const config = readApiConfig(process.env);
    let attachments;
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

    if (config.objectStorage && pool) {
      objectClient = new S3Client({
        credentials: {
          accessKeyId: config.objectStorage.accessKeyId,
          secretAccessKey: config.objectStorage.secretAccessKey,
        },
        endpoint: config.objectStorage.endpoint,
        forcePathStyle: config.objectStorage.forcePathStyle,
        region: config.objectStorage.region,
      });
      const storage = new S3CompatibleObjectStorage({
        bucket: config.objectStorage.bucket,
        client: objectClient,
      });
      await storage.assertReady();
      attachments = new HostedAttachmentService({
        documents: new PostgresHostedReceiptDocumentRepository(pool),
        inspector: new PdfLibAttachmentInspector(),
        storage,
      });
    }

    const app = await buildApi({
      ...(attachments ? { attachments } : {}),
      config,
      ...(pool
        ? {
            onClose: async () => {
              objectClient?.destroy();
              await pool?.end();
            },
            storage: 'postgresql' as const,
          }
        : {}),
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
    objectClient?.destroy();

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
