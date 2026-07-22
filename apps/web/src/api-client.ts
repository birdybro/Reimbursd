// SPDX-License-Identifier: GPL-3.0-only
import { supportedCurrencyCodes, validateReceipt, type Receipt } from '@reimbursd/domain';
import { z } from 'zod';

const maximumResponseCharacters = 1_048_576;
const offsetDateTimeSchema = z.string().datetime({ offset: true });
const receiptSchema = z
  .object({
    capturedAt: offsetDateTimeSchema,
    categoryId: z.string().uuid().nullable(),
    createdAt: offsetDateTimeSchema,
    currencyCode: z.enum(supportedCurrencyCodes),
    deletedAt: offsetDateTimeSchema.nullable(),
    discountMinor: z.number().int().nonnegative().safe(),
    id: z.string().uuid(),
    locationId: z.string().uuid().nullable(),
    merchantId: z.string().uuid(),
    merchantName: z.string().min(1).max(200),
    notes: z.string().max(2_000),
    purchasedAt: offsetDateTimeSchema,
    sourceType: z.literal('manual'),
    subtotalMinor: z.number().int().nonnegative().safe(),
    taxMinor: z.number().int().nonnegative().safe(),
    tipMinor: z.number().int().nonnegative().safe(),
    totalMinor: z.number().int().nonnegative().safe(),
    updatedAt: offsetDateTimeSchema,
    version: z.number().int().positive().safe(),
  })
  .strict();
const receiptListSchema = z.array(receiptSchema).max(100);
const sessionSchema = z
  .object({
    accessToken: z.string().min(1).max(8_192),
    expiresInSeconds: z.number().int().positive(),
  })
  .strict();
const apiErrorSchema = z
  .object({ code: z.string().min(1).max(40), message: z.string().min(1).max(200) })
  .strict();

export interface DevelopmentSession {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface CreateHostedReceiptInput {
  readonly capturedAt: string;
  readonly currencyCode: (typeof supportedCurrencyCodes)[number];
  readonly discountMinor: number;
  readonly id: string;
  readonly merchantId: string;
  readonly merchantName: string;
  readonly notes: string;
  readonly purchasedAt: string;
  readonly subtotalMinor: number;
  readonly taxMinor: number;
  readonly tipMinor: number;
  readonly totalMinor: number;
}

export interface WebApi {
  createDevelopmentSession(userId: string): Promise<DevelopmentSession>;
  createReceipt(accessToken: string, input: CreateHostedReceiptInput): Promise<Receipt>;
  listReceipts(accessToken: string): Promise<readonly Receipt[]>;
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number) {
    super('The API request could not be completed.');
    this.name = 'ApiRequestError';
    this.code = code;
    this.status = status;
  }
}

export class ReimbursdWebApi implements WebApi {
  readonly #basePath: string;
  readonly #fetch: typeof fetch;

  constructor(options: { readonly basePath?: string; readonly fetch?: typeof fetch } = {}) {
    this.#basePath = validateBasePath(options.basePath ?? '/api');
    this.#fetch = (options.fetch ?? globalThis.fetch).bind(globalThis);
  }

  async createDevelopmentSession(userId: string): Promise<DevelopmentSession> {
    return sessionSchema.parse(
      await this.#request('/development/session', {
        body: JSON.stringify({ userId }),
        method: 'POST',
      }),
    );
  }

  async createReceipt(accessToken: string, input: CreateHostedReceiptInput): Promise<Receipt> {
    return parseReceipt(
      await this.#request('/v1/receipts', {
        accessToken,
        body: JSON.stringify(input),
        method: 'POST',
      }),
    );
  }

  async listReceipts(accessToken: string): Promise<readonly Receipt[]> {
    const parsed = receiptListSchema.safeParse(
      await this.#request('/v1/receipts', { accessToken, method: 'GET' }),
    );

    if (!parsed.success || parsed.data.some((receipt) => validateReceipt(receipt).length > 0)) {
      throw new ApiRequestError('invalid_response', 502);
    }

    return parsed.data;
  }

  async #request(
    path: string,
    options: {
      readonly accessToken?: string;
      readonly body?: string;
      readonly method: 'GET' | 'POST';
    },
  ): Promise<unknown> {
    const response = await this.#fetch(`${this.#basePath}${path}`, {
      cache: 'no-store',
      credentials: 'omit',
      headers: {
        accept: 'application/json',
        ...(options.accessToken ? { authorization: `Bearer ${options.accessToken}` } : {}),
        ...(options.body ? { 'content-type': 'application/json' } : {}),
      },
      method: options.method,
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      ...(options.body ? { body: options.body } : {}),
    });
    const contentLength = Number(response.headers.get('content-length') ?? '0');

    if (Number.isFinite(contentLength) && contentLength > maximumResponseCharacters) {
      throw new ApiRequestError('response_too_large', response.status);
    }

    const text = await response.text();

    if (text.length > maximumResponseCharacters) {
      throw new ApiRequestError('response_too_large', response.status);
    }

    const payload = parseJson(text);

    if (!response.ok) {
      const parsedError = apiErrorSchema.safeParse(payload);
      throw new ApiRequestError(
        parsedError.success ? parsedError.data.code : 'request_failed',
        response.status,
      );
    }

    return payload;
  }
}

function validateBasePath(value: string): string {
  if (!/^\/[a-zA-Z0-9/_-]*$/.test(value) || value.includes('//') || value.length > 128) {
    throw new TypeError('Web API base path must be a bounded same-origin path.');
  }

  return value.endsWith('/') ? value.slice(0, -1) : value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new ApiRequestError('invalid_response', 502);
  }
}

function parseReceipt(value: unknown): Receipt {
  const parsed = receiptSchema.safeParse(value);

  if (!parsed.success || validateReceipt(parsed.data).length > 0) {
    throw new ApiRequestError('invalid_response', 502);
  }

  return parsed.data;
}
