// SPDX-License-Identifier: GPL-3.0-only
import { z } from 'zod';

export const apiJwtAudience = 'reimbursd-api';
export const apiJwtIssuer = 'reimbursd-self-hosted';
export const apiTokenLifetimeSeconds = 15 * 60;

const configSchema = z
  .object({
    databaseUrl: z
      .string()
      .url()
      .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol))
      .nullable(),
    developmentAuthEnabled: z.boolean(),
    host: z.string().min(1).max(255),
    jwtSecret: z.string().min(32),
    nodeEnvironment: z.enum(['development', 'production', 'test']),
    objectStorage: z
      .object({
        accessKeyId: z.string().min(3).max(128),
        bucket: z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/),
        endpoint: z
          .string()
          .url()
          .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol)),
        forcePathStyle: z.boolean(),
        region: z.string().min(1).max(128),
        secretAccessKey: z.string().min(8).max(256),
      })
      .nullable(),
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

    if (config.nodeEnvironment === 'production' && config.databaseUrl === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production API configuration requires PostgreSQL.',
        path: ['databaseUrl'],
      });
    }

    if (config.objectStorage !== null && config.databaseUrl === null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Object storage requires PostgreSQL metadata storage.',
        path: ['objectStorage'],
      });
    }
  });

export type ApiConfig = z.infer<typeof configSchema>;

export function readApiConfig(environment: NodeJS.ProcessEnv): ApiConfig {
  const port = Number(environment.REIMBURSD_API_PORT ?? '3000');
  const objectStorageValues = [
    environment.REIMBURSD_OBJECT_ACCESS_KEY_ID,
    environment.REIMBURSD_OBJECT_BUCKET,
    environment.REIMBURSD_OBJECT_ENDPOINT,
    environment.REIMBURSD_OBJECT_REGION,
    environment.REIMBURSD_OBJECT_SECRET_ACCESS_KEY,
  ];
  const objectStorageConfigured = objectStorageValues.some(
    (value) => value !== undefined && value !== '',
  );

  return configSchema.parse({
    databaseUrl: environment.REIMBURSD_DATABASE_URL || null,
    developmentAuthEnabled: environment.REIMBURSD_DEV_AUTH_ENABLED === 'true',
    host: environment.REIMBURSD_API_HOST ?? '127.0.0.1',
    jwtSecret: environment.REIMBURSD_API_JWT_SECRET,
    nodeEnvironment: environment.NODE_ENV ?? 'development',
    objectStorage: objectStorageConfigured
      ? {
          accessKeyId: environment.REIMBURSD_OBJECT_ACCESS_KEY_ID,
          bucket: environment.REIMBURSD_OBJECT_BUCKET,
          endpoint: environment.REIMBURSD_OBJECT_ENDPOINT,
          forcePathStyle: environment.REIMBURSD_OBJECT_FORCE_PATH_STYLE !== 'false',
          region: environment.REIMBURSD_OBJECT_REGION,
          secretAccessKey: environment.REIMBURSD_OBJECT_SECRET_ACCESS_KEY,
        }
      : null,
    port,
  });
}
