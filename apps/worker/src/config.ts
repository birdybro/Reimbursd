// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod';

const workerConfigSchema = z.object({
  databaseUrl: z
    .string()
    .url()
    .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol)),
  nodeEnvironment: z.enum(['development', 'production', 'test']),
});

export type WorkerConfig = z.infer<typeof workerConfigSchema>;

export function readWorkerConfig(environment: NodeJS.ProcessEnv): WorkerConfig {
  return workerConfigSchema.parse({
    databaseUrl: environment.REIMBURSD_DATABASE_URL,
    nodeEnvironment: environment.NODE_ENV ?? 'development',
  });
}
