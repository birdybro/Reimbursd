// SPDX-License-Identifier: GPL-3.0-only
import fastifyJwt from '@fastify/jwt';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifySwagger from '@fastify/swagger';
import { createManualReceipt, ReceiptValidationError } from '@reimbursd/domain';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { apiJwtAudience, apiJwtIssuer, apiTokenLifetimeSeconds, type ApiConfig } from './config.js';
import { InMemoryHostedReceiptRepository } from './in-memory-receipt-repository.js';
import {
  HostedReceiptAlreadyExistsError,
  type HostedReceiptRepository,
} from './receipt-repository.js';
import {
  apiErrorJsonSchema,
  createReceiptBodyJsonSchema,
  createReceiptBodySchema,
  developmentSessionBodyJsonSchema,
  developmentSessionBodySchema,
  healthResponseJsonSchema,
  receiptIdParamsJsonSchema,
  receiptIdParamsSchema,
  receiptJsonSchema,
  sessionResponseJsonSchema,
  type ApiError,
} from './schemas.js';

const authClaimsSchema = z
  .object({
    aud: z.union([
      z.literal(apiJwtAudience),
      z.array(z.string()).refine((audiences) => audiences.includes(apiJwtAudience)),
    ]),
    exp: z.number().int(),
    iat: z.number().int(),
    iss: z.literal(apiJwtIssuer),
    sub: z.string().uuid(),
  })
  .passthrough();

const unauthorizedError: ApiError = {
  code: 'unauthorized',
  message: 'A valid bearer token is required.',
};

const invalidRequestError: ApiError = {
  code: 'invalid_request',
  message: 'The request is invalid.',
};

const notFoundError: ApiError = {
  code: 'not_found',
  message: 'The requested resource was not found.',
};

const internalError: ApiError = {
  code: 'internal_error',
  message: 'The request could not be completed.',
};

const requestTooLargeError: ApiError = {
  code: 'request_too_large',
  message: 'The request body exceeds the allowed size.',
};

const rateLimitError: ApiError = {
  code: 'rate_limit_exceeded',
  message: 'Too many requests. Try again later.',
};

export interface BuildApiOptions {
  readonly config: ApiConfig;
  readonly onClose?: () => Promise<void>;
  readonly repository?: HostedReceiptRepository;
  readonly storage?: 'postgresql' | 'process-memory';
}

export async function buildApi(options: BuildApiOptions): Promise<FastifyInstance> {
  const repository = options.repository ?? new InMemoryHostedReceiptRepository();
  const storage = options.storage ?? 'process-memory';
  const app = Fastify({
    ajv: { customOptions: { removeAdditional: false } },
    bodyLimit: 64 * 1_024,
    logger: false,
  });

  await app.register(fastifySwagger, {
    openapi: {
      components: {
        securitySchemes: {
          bearerAuth: { bearerFormat: 'JWT', scheme: 'bearer', type: 'http' },
        },
      },
      info: {
        description: 'Self-hosted Reimbursd API. Local mobile use does not depend on this service.',
        title: 'Reimbursd API',
        version: '0.1.0',
      },
      openapi: '3.1.1',
    },
  });
  await app.register(fastifyJwt, {
    secret: options.config.jwtSecret,
    verify: {
      algorithms: ['HS256'],
      allowedAud: apiJwtAudience,
      allowedIss: apiJwtIssuer,
      requiredClaims: ['sub', 'iss', 'aud', 'exp'],
    },
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  });

  if (options.onClose) {
    app.addHook('onClose', options.onClose);
  }

  app.setNotFoundHandler((_request, reply) => reply.code(404).send(notFoundError));
  app.setErrorHandler((error, _request, reply) => {
    if (hasStatusCode(error, 413)) {
      return reply.code(413).send(requestTooLargeError);
    }

    if (hasStatusCode(error, 429)) {
      return reply.code(429).send(rateLimitError);
    }

    if (
      isFastifyValidationError(error) ||
      error instanceof z.ZodError ||
      error instanceof ReceiptValidationError
    ) {
      return reply.code(400).send(invalidRequestError);
    }

    if (error instanceof HostedReceiptAlreadyExistsError) {
      return reply.code(409).send({
        code: 'receipt_conflict',
        message: 'The receipt could not be created because its ID is already in use.',
      });
    }

    return reply.code(500).send(internalError);
  });

  app.get(
    '/health',
    {
      schema: {
        description: 'Reports process readiness and the active non-durable storage adapter.',
        operationId: 'getHealth',
        response: { 200: healthResponseJsonSchema },
        tags: ['system'],
      },
    },
    async () => ({ status: 'ok' as const, storage }),
  );

  app.get(
    '/openapi.json',
    {
      schema: {
        description: 'Returns the machine-readable API contract.',
        operationId: 'getOpenApi',
        tags: ['system'],
      },
    },
    async () => app.swagger(),
  );

  if (options.config.developmentAuthEnabled) {
    app.post(
      '/development/session',
      {
        config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
        schema: {
          body: developmentSessionBodyJsonSchema,
          description:
            'Issues a short-lived synthetic identity token for isolated development only.',
          operationId: 'createDevelopmentSession',
          response: {
            200: sessionResponseJsonSchema,
            400: apiErrorJsonSchema,
            429: apiErrorJsonSchema,
          },
          tags: ['development'],
        },
      },
      async (request) => {
        const { userId } = developmentSessionBodySchema.parse(request.body);
        const accessToken = app.jwt.sign(
          {},
          {
            algorithm: 'HS256',
            aud: apiJwtAudience,
            expiresIn: apiTokenLifetimeSeconds,
            iss: apiJwtIssuer,
            sub: userId,
          },
        );

        return { accessToken, expiresInSeconds: apiTokenLifetimeSeconds };
      },
    );
  }

  app.post(
    '/v1/receipts',
    {
      onRequest: requireOwner,
      schema: {
        body: createReceiptBodyJsonSchema,
        description: 'Creates an owner-scoped manual receipt using integer minor currency units.',
        operationId: 'createReceipt',
        response: {
          201: receiptJsonSchema,
          400: apiErrorJsonSchema,
          401: apiErrorJsonSchema,
          409: apiErrorJsonSchema,
          413: apiErrorJsonSchema,
          429: apiErrorJsonSchema,
          500: apiErrorJsonSchema,
        },
        security: [{ bearerAuth: [] }],
        tags: ['receipts'],
      },
    },
    async (request, reply) => {
      const input = createReceiptBodySchema.parse(request.body);
      const receipt = createManualReceipt({
        capturedAt: input.capturedAt,
        currencyCode: input.currencyCode,
        id: input.id,
        merchantId: input.merchantId,
        merchantName: input.merchantName,
        purchasedAt: input.purchasedAt,
        subtotalMinor: input.subtotalMinor,
        taxMinor: input.taxMinor,
        tipMinor: input.tipMinor,
        totalMinor: input.totalMinor,
        ...(input.discountMinor === undefined ? {} : { discountMinor: input.discountMinor }),
        ...(input.notes === undefined ? {} : { notes: input.notes }),
      });
      const savedReceipt = await repository.create(getOwnerId(request), receipt);
      return reply.code(201).send(savedReceipt);
    },
  );

  app.get(
    '/v1/receipts/:receiptId',
    {
      onRequest: requireOwner,
      schema: {
        description: 'Returns a manual receipt only when it belongs to the authenticated owner.',
        operationId: 'getReceipt',
        params: receiptIdParamsJsonSchema,
        response: {
          200: receiptJsonSchema,
          400: apiErrorJsonSchema,
          401: apiErrorJsonSchema,
          404: apiErrorJsonSchema,
          429: apiErrorJsonSchema,
          500: apiErrorJsonSchema,
        },
        security: [{ bearerAuth: [] }],
        tags: ['receipts'],
      },
    },
    async (request, reply) => {
      const { receiptId } = receiptIdParamsSchema.parse(request.params);
      const receipt = await repository.getByIdForOwner(getOwnerId(request), receiptId);

      if (!receipt) {
        return reply.code(404).send(notFoundError);
      }

      return reply.send(receipt);
    },
  );

  await app.ready();
  return app;
}

async function requireOwner(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const decoded = await request.jwtVerify<object>();
    authClaimsSchema.parse(decoded);
  } catch {
    await reply.code(401).send(unauthorizedError);
  }
}

function getOwnerId(request: FastifyRequest): string {
  return authClaimsSchema.parse(request.user).sub;
}

function isFastifyValidationError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'validation' in error;
}

function hasStatusCode(error: unknown, statusCode: number): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'statusCode' in error &&
    error.statusCode === statusCode
  );
}
