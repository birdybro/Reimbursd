// SPDX-License-Identifier: GPL-3.0-only
import { supportedCurrencyCodes, type Receipt } from '@reimbursd/domain';
import { z } from 'zod';

const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
const uuidJsonSchema = { format: 'uuid', type: 'string' } as const;
const offsetDateTimeJsonSchema = { format: 'date-time', maxLength: 35, type: 'string' } as const;
const amountJsonSchema = {
  maximum: maximumSafeInteger,
  minimum: 0,
  type: 'integer',
} as const;

export const apiErrorJsonSchema = {
  additionalProperties: false,
  properties: {
    code: { maxLength: 40, type: 'string' },
    message: { maxLength: 200, type: 'string' },
  },
  required: ['code', 'message'],
  type: 'object',
} as const;

export const createReceiptBodyJsonSchema = {
  additionalProperties: false,
  properties: {
    capturedAt: offsetDateTimeJsonSchema,
    currencyCode: { enum: supportedCurrencyCodes, type: 'string' },
    discountMinor: amountJsonSchema,
    id: uuidJsonSchema,
    merchantId: uuidJsonSchema,
    merchantName: { maxLength: 200, minLength: 1, type: 'string' },
    notes: { maxLength: 2_000, type: 'string' },
    purchasedAt: offsetDateTimeJsonSchema,
    subtotalMinor: amountJsonSchema,
    taxMinor: amountJsonSchema,
    tipMinor: amountJsonSchema,
    totalMinor: amountJsonSchema,
  },
  required: [
    'capturedAt',
    'currencyCode',
    'id',
    'merchantId',
    'merchantName',
    'purchasedAt',
    'subtotalMinor',
    'taxMinor',
    'tipMinor',
    'totalMinor',
  ],
  type: 'object',
} as const;

export const receiptJsonSchema = {
  additionalProperties: false,
  properties: {
    capturedAt: offsetDateTimeJsonSchema,
    categoryId: { anyOf: [uuidJsonSchema, { type: 'null' }] },
    createdAt: offsetDateTimeJsonSchema,
    currencyCode: { enum: supportedCurrencyCodes, type: 'string' },
    deletedAt: { anyOf: [offsetDateTimeJsonSchema, { type: 'null' }] },
    discountMinor: amountJsonSchema,
    id: uuidJsonSchema,
    locationId: { anyOf: [uuidJsonSchema, { type: 'null' }] },
    merchantId: uuidJsonSchema,
    merchantName: { maxLength: 200, minLength: 1, type: 'string' },
    notes: { maxLength: 2_000, type: 'string' },
    purchasedAt: offsetDateTimeJsonSchema,
    sourceType: { enum: ['manual'], type: 'string' },
    subtotalMinor: amountJsonSchema,
    taxMinor: amountJsonSchema,
    tipMinor: amountJsonSchema,
    totalMinor: amountJsonSchema,
    updatedAt: offsetDateTimeJsonSchema,
    version: { maximum: maximumSafeInteger, minimum: 1, type: 'integer' },
  },
  required: [
    'capturedAt',
    'categoryId',
    'createdAt',
    'currencyCode',
    'deletedAt',
    'discountMinor',
    'id',
    'locationId',
    'merchantId',
    'merchantName',
    'notes',
    'purchasedAt',
    'sourceType',
    'subtotalMinor',
    'taxMinor',
    'tipMinor',
    'totalMinor',
    'updatedAt',
    'version',
  ],
  type: 'object',
} as const;

export const receiptIdParamsJsonSchema = {
  additionalProperties: false,
  properties: { receiptId: uuidJsonSchema },
  required: ['receiptId'],
  type: 'object',
} as const;

export const developmentSessionBodyJsonSchema = {
  additionalProperties: false,
  properties: { userId: uuidJsonSchema },
  required: ['userId'],
  type: 'object',
} as const;

export const sessionResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    accessToken: { minLength: 1, type: 'string' },
    expiresInSeconds: { minimum: 1, type: 'integer' },
  },
  required: ['accessToken', 'expiresInSeconds'],
  type: 'object',
} as const;

export const healthResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    status: { enum: ['ok'], type: 'string' },
    storage: { enum: ['process-memory'], type: 'string' },
  },
  required: ['status', 'storage'],
  type: 'object',
} as const;

export const createReceiptBodySchema = z
  .object({
    capturedAt: z.string().max(35),
    currencyCode: z.enum(supportedCurrencyCodes),
    discountMinor: z.number().int().nonnegative().safe().optional(),
    id: z.string().uuid(),
    merchantId: z.string().uuid(),
    merchantName: z.string().min(1).max(200),
    notes: z.string().max(2_000).optional(),
    purchasedAt: z.string().max(35),
    subtotalMinor: z.number().int().nonnegative().safe(),
    taxMinor: z.number().int().nonnegative().safe(),
    tipMinor: z.number().int().nonnegative().safe(),
    totalMinor: z.number().int().nonnegative().safe(),
  })
  .strict();

export const receiptIdParamsSchema = z.object({ receiptId: z.string().uuid() }).strict();
export const developmentSessionBodySchema = z.object({ userId: z.string().uuid() }).strict();

export type CreateReceiptBody = z.infer<typeof createReceiptBodySchema>;

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export interface SessionResponse {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export type ReceiptResponse = Receipt;
