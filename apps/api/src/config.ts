// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod';

export const apiJwtAudience = 'reimbursd-api';
export const apiJwtIssuer = 'reimbursd-self-hosted';
export const apiTokenLifetimeSeconds = 15 * 60;

const configSchema = z
  .object({
    developmentAuthEnabled: z.boolean(),
    host: z.string().min(1).max(255),
    jwtSecret: z.string().min(32),
    nodeEnvironment: z.enum(['development', 'production', 'test']),
    port: z.number().int().min(1).max(65_535),
  })
  .superRefine((config, context) => {
    if (config.nodeEnvironment === 'production' && config.developmentAuthEnabled) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Development authentication cannot be enabled in production.',
        path: ['developmentAuthEnabled'],
      });
    }
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function readApiConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const port = Number(environment.REIMBURSD_API_PORT ?? '3000');

  return configSchema.parse({
    developmentAuthEnabled: environment.REIMBURSD_DEV_AUTH_ENABLED === 'true',
    host: environment.REIMBURSD_API_HOST ?? '127.0.0.1',
    jwtSecret: environment.REIMBURSD_API_JWT_SECRET,
    nodeEnvironment: environment.NODE_ENV ?? 'development',
    port,
  });
}
