// SPDX-License-Identifier: GPL-3.0-only
import type { Receipt, ReceiptDocument } from '@reimbursd/domain';
import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApi } from './app.js';
import type { ApiConfig } from './config.js';
import type { HostedAttachmentOperations } from './hosted-attachment-service.js';
import type { HostedReceiptRepository } from './receipt-repository.js';
import type { ApiError, CreateReceiptBody, SessionResponse } from './schemas.js';

const testConfig: ApiConfig = {
  databaseUrl: null,
  developmentAuthEnabled: true,
  host: '127.0.0.1',
  jwtSecret: 'test-only-api-secret-that-is-at-least-32-characters',
  nodeEnvironment: 'test',
  objectStorage: null,
  port: 3000,
};

const ownerA = '00000000-0000-4000-8000-000000000001';
const ownerB = '00000000-0000-4000-8000-000000000002';
const receiptId = '10000000-0000-4000-8000-000000000001';

function createReceipt(overrides: Partial<CreateReceiptBody> = {}): CreateReceiptBody {
  return {
    capturedAt: '2026-07-18T12:00:00-06:00',
    currencyCode: 'USD',
    discountMinor: 0,
    id: receiptId,
    merchantId: '20000000-0000-4000-8000-000000000001',
    merchantName: 'Synthetic Merchant',
    notes: 'Synthetic test data only',
    purchasedAt: '2026-07-18T11:30:00-06:00',
    subtotalMinor: 1_000,
    taxMinor: 80,
    tipMinor: 200,
    totalMinor: 1_280,
    ...overrides,
  };
}

async function issueToken(app: FastifyInstance, userId: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    payload: { userId },
    url: '/development/session',
  });
  const session = response.json<SessionResponse>();

  expect(response.statusCode).toBe(200);
  expect(session.expiresInSeconds).toBe(900);
  return session.accessToken;
}

describe('Reimbursd API', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApi({ config: testConfig });
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports the explicitly non-durable storage adapter', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', storage: 'process-memory' });
  });

  it('generates OpenAPI for implemented authentication and receipt routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/openapi.json' });
    const document = response.json<{
      components?: { securitySchemes?: Record<string, unknown> };
      openapi?: string;
      paths?: Record<string, unknown>;
    }>();

    expect(response.statusCode).toBe(200);
    expect(document.openapi).toBe('3.1.1');
    expect(document.paths).toHaveProperty('/v1/receipts');
    expect(document.paths).toHaveProperty('/v1/receipts/{receiptId}');
    expect(document.components?.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('creates and retrieves an owner-scoped manual receipt', async () => {
    const token = await issueToken(app, ownerA);
    const createResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: createReceipt(),
      url: '/v1/receipts',
    });
    const getResponse = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      url: `/v1/receipts/${receiptId}`,
    });

    expect(createResponse.statusCode).toBe(201);
    expect(createResponse.json<Receipt>()).toMatchObject({
      id: receiptId,
      sourceType: 'manual',
      totalMinor: 1_280,
      version: 1,
    });
    expect(getResponse.statusCode).toBe(200);
    expect(getResponse.json<Receipt>()).toEqual(createResponse.json<Receipt>());
  });

  it('makes cross-owner and missing receipt responses indistinguishable', async () => {
    const tokenA = await issueToken(app, ownerA);
    const tokenB = await issueToken(app, ownerB);
    await app.inject({
      headers: { authorization: `Bearer ${tokenA}` },
      method: 'POST',
      payload: createReceipt(),
      url: '/v1/receipts',
    });

    const crossOwner = await app.inject({
      headers: { authorization: `Bearer ${tokenB}` },
      method: 'GET',
      url: `/v1/receipts/${receiptId}`,
    });
    const missing = await app.inject({
      headers: { authorization: `Bearer ${tokenB}` },
      method: 'GET',
      url: '/v1/receipts/10000000-0000-4000-8000-000000000099',
    });

    expect(crossOwner.statusCode).toBe(404);
    expect(crossOwner.body).toBe(missing.body);
    expect(crossOwner.body).not.toContain(receiptId);
  });

  it('rejects missing and malformed bearer tokens with a bounded response', async () => {
    const missing = await app.inject({ method: 'GET', url: `/v1/receipts/${receiptId}` });
    const malformed = await app.inject({
      headers: { authorization: 'Bearer not-a-valid-token' },
      method: 'GET',
      url: `/v1/receipts/${receiptId}`,
    });
    const expected: ApiError = {
      code: 'unauthorized',
      message: 'A valid bearer token is required.',
    };

    expect(missing.statusCode).toBe(401);
    expect(missing.json()).toEqual(expected);
    expect(malformed.statusCode).toBe(401);
    expect(malformed.json()).toEqual(expected);
  });

  it('rejects tokens with the wrong issuer or audience', async () => {
    const wrongAudience = app.jwt.sign(
      {},
      {
        algorithm: 'HS256',
        aud: 'another-api',
        expiresIn: 900,
        iss: 'reimbursd-self-hosted',
        sub: ownerA,
      },
    );
    const wrongIssuer = app.jwt.sign(
      {},
      {
        algorithm: 'HS256',
        aud: 'reimbursd-api',
        expiresIn: 900,
        iss: 'another-issuer',
        sub: ownerA,
      },
    );

    for (const token of [wrongAudience, wrongIssuer]) {
      const response = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: 'GET',
        url: `/v1/receipts/${receiptId}`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        code: 'unauthorized',
        message: 'A valid bearer token is required.',
      });
    }
  });

  it('rejects unknown body fields and inconsistent totals', async () => {
    const token = await issueToken(app, ownerA);
    const extraField = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: { ...createReceipt(), ownerId: ownerB },
      url: '/v1/receipts',
    });
    const inconsistentTotal = await app.inject({
      headers: { authorization: `Bearer ${token}` },
      method: 'POST',
      payload: createReceipt({ totalMinor: 1_281 }),
      url: '/v1/receipts',
    });

    expect(extraField.statusCode).toBe(400);
    expect(extraField.json()).toEqual({
      code: 'invalid_request',
      message: 'The request is invalid.',
    });
    expect(inconsistentTotal.statusCode).toBe(400);
    expect(inconsistentTotal.body).not.toContain('1281');
  });

  it('returns a bounded conflict without exposing stored receipt data', async () => {
    const token = await issueToken(app, ownerA);
    const request = {
      headers: { authorization: `Bearer ${token}` },
      method: 'POST' as const,
      payload: createReceipt(),
      url: '/v1/receipts',
    };
    await app.inject(request);
    const duplicate = await app.inject(request);

    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.body).not.toContain('Synthetic Merchant');
    expect(duplicate.body).not.toContain(receiptId);
  });

  it('rejects request bodies over 64 KiB without reflecting their contents', async () => {
    const token = await issueToken(app, ownerA);
    const sensitiveMarker = 'SENSITIVE_MARKER';
    const response = await app.inject({
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      method: 'POST',
      payload: JSON.stringify({
        ...createReceipt(),
        notes: sensitiveMarker.repeat(5_000),
      }),
      url: '/v1/receipts',
    });

    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({
      code: 'request_too_large',
      message: 'The request body exceeds the allowed size.',
    });
    expect(response.body).not.toContain(sensitiveMarker);
  });
});

describe('API boundary configuration', () => {
  it('proxies attachment bytes only for the authenticated metadata owner', async () => {
    const attachmentBytes = Uint8Array.from([1, 2, 3, 4]);
    const document: ReceiptDocument = {
      byteSize: attachmentBytes.byteLength,
      createdAt: '2026-07-18T18:00:00.000Z',
      heightPixels: 1,
      id: '30000000-0000-4000-8000-000000000001',
      isOriginal: true,
      mimeType: 'image/png',
      originalFilename: "synthetic (owner's).png",
      pageCount: 1,
      parentDocumentId: null,
      receiptId,
      sha256: '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a',
      sourceType: 'image_import',
      storageDeletedAt: null,
      storageReference: 'private-key-not-for-api-response',
      widthPixels: 1,
    };
    const attachments: HostedAttachmentOperations = {
      async download(ownerId) {
        return ownerId === ownerA ? { bytes: attachmentBytes, document } : null;
      },
      async upload(input) {
        expect(input.ownerId).toBe(ownerA);
        expect([...input.bytes]).toEqual([...attachmentBytes]);
        return document;
      },
    };
    const app = await buildApi({ attachments, config: testConfig });

    try {
      const tokenA = await issueToken(app, ownerA);
      const tokenB = await issueToken(app, ownerB);
      const uploadResponse = await app.inject({
        headers: { authorization: `Bearer ${tokenA}` },
        method: 'POST',
        payload: {
          bytesBase64: Buffer.from(attachmentBytes).toString('base64'),
          documentId: document.id,
          originalFilename: document.originalFilename,
          sourceType: document.sourceType,
        },
        url: `/v1/receipts/${receiptId}/documents`,
      });
      const crossOwner = await app.inject({
        headers: { authorization: `Bearer ${tokenB}` },
        method: 'GET',
        url: `/v1/receipts/${receiptId}/documents/${document.id}/content`,
      });
      const ownerDownload = await app.inject({
        headers: { authorization: `Bearer ${tokenA}` },
        method: 'GET',
        url: `/v1/receipts/${receiptId}/documents/${document.id}/content`,
      });
      const openApiResponse = await app.inject({ method: 'GET', url: '/openapi.json' });
      const openApi = openApiResponse.json<{ paths?: Record<string, unknown> }>();

      expect(uploadResponse.statusCode).toBe(201);
      expect(uploadResponse.body).not.toContain('private-key-not-for-api-response');
      expect(crossOwner.statusCode).toBe(404);
      expect(ownerDownload.statusCode).toBe(200);
      expect(ownerDownload.rawPayload).toEqual(Buffer.from(attachmentBytes));
      expect(ownerDownload.headers['content-type']).toBe('image/png');
      expect(ownerDownload.headers['content-disposition']).toBe(
        'attachment; filename="receipt"; filename*=UTF-8\'\'synthetic%20%28owner%27s%29.png',
      );
      expect(openApi.paths).toHaveProperty('/v1/receipts/{receiptId}/documents');
      expect(openApi.paths).toHaveProperty(
        '/v1/receipts/{receiptId}/documents/{documentId}/content',
      );
    } finally {
      await app.close();
    }
  });

  it('reports PostgreSQL and runs configured cleanup on close', async () => {
    const onClose = vi.fn(async () => undefined);
    const app = await buildApi({
      config: testConfig,
      onClose,
      storage: 'postgresql',
    });

    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.json()).toEqual({ status: 'ok', storage: 'postgresql' });

    await app.close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('applies the bounded development-session rate limit', async () => {
    const app = await buildApi({ config: testConfig });

    try {
      let finalBody: unknown;
      let finalStatus = 0;

      for (let attempt = 0; attempt < 21; attempt += 1) {
        const response = await app.inject({
          method: 'POST',
          payload: { userId: ownerA },
          url: '/development/session',
        });
        finalBody = response.json<unknown>();
        finalStatus = response.statusCode;
      }

      expect(finalStatus).toBe(429);
      expect(finalBody).toEqual({
        code: 'rate_limit_exceeded',
        message: 'Too many requests. Try again later.',
      });
    } finally {
      await app.close();
    }
  });

  it('does not register development identity issuance by default', async () => {
    const app = await buildApi({
      config: { ...testConfig, developmentAuthEnabled: false },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        payload: { userId: ownerA },
        url: '/development/session',
      });

      expect(response.statusCode).toBe(404);
      expect(response.body).not.toContain('/development/session');
    } finally {
      await app.close();
    }
  });

  it('redacts internal repository exceptions', async () => {
    const sensitiveErrorRepository: HostedReceiptRepository = {
      async create() {
        throw new Error('Synthetic Merchant notes and total 1280 must never leave the server');
      },
      async getByIdForOwner() {
        throw new Error('Private receipt lookup details');
      },
    };
    const app = await buildApi({ config: testConfig, repository: sensitiveErrorRepository });

    try {
      const token = await issueToken(app, ownerA);
      const response = await app.inject({
        headers: { authorization: `Bearer ${token}` },
        method: 'POST',
        payload: createReceipt(),
        url: '/v1/receipts',
      });

      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({
        code: 'internal_error',
        message: 'The request could not be completed.',
      });
      expect(response.body).not.toContain('Synthetic Merchant');
      expect(response.body).not.toContain('1280');
    } finally {
      await app.close();
    }
  });
});
