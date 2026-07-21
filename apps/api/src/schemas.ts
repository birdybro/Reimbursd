// SPDX-License-Identifier: GPL-3.0-only
import { supportedCurrencyCodes, type Receipt } from '@reimbursd/domain';
import { z } from 'zod';

const maximumSafeInteger = Number.MAX_SAFE_INTEGER;
export const hostedAttachmentMaximumByteSize = 25 * 1_024 * 1_024;
export const hostedAttachmentMaximumBase64Length =
  Math.ceil(hostedAttachmentMaximumByteSize / 3) * 4;
export const hostedAttachmentRequestBodyLimit = hostedAttachmentMaximumBase64Length + 8_192;
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

export const receiptIdOnlyParamsJsonSchema = {
  additionalProperties: false,
  properties: { receiptId: uuidJsonSchema },
  required: ['receiptId'],
  type: 'object',
} as const;

export const receiptDocumentParamsJsonSchema = {
  additionalProperties: false,
  properties: { documentId: uuidJsonSchema, receiptId: uuidJsonSchema },
  required: ['receiptId', 'documentId'],
  type: 'object',
} as const;

export const uploadAttachmentBodyJsonSchema = {
  additionalProperties: false,
  properties: {
    bytesBase64: {
      maxLength: hostedAttachmentMaximumBase64Length,
      minLength: 4,
      pattern: '^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$',
      type: 'string',
    },
    documentId: uuidJsonSchema,
    originalFilename: { maxLength: 255, minLength: 1, type: 'string' },
    sourceType: { enum: ['camera', 'image_import', 'pdf_import'], type: 'string' },
  },
  required: ['bytesBase64', 'documentId', 'originalFilename', 'sourceType'],
  type: 'object',
} as const;

export const receiptDocumentResponseJsonSchema = {
  additionalProperties: false,
  properties: {
    byteSize: { maximum: maximumSafeInteger, minimum: 1, type: 'integer' },
    createdAt: offsetDateTimeJsonSchema,
    documentId: uuidJsonSchema,
    heightPixels: {
      anyOf: [{ maximum: maximumSafeInteger, minimum: 1, type: 'integer' }, { type: 'null' }],
    },
    mimeType: { enum: ['application/pdf', 'image/jpeg', 'image/png'], type: 'string' },
    originalFilename: { maxLength: 255, minLength: 1, type: 'string' },
    pageCount: { maximum: maximumSafeInteger, minimum: 1, type: 'integer' },
    receiptId: uuidJsonSchema,
    sha256: { pattern: '^[0-9a-f]{64}$', type: 'string' },
    sourceType: { enum: ['camera', 'image_import', 'pdf_import'], type: 'string' },
    widthPixels: {
      anyOf: [{ maximum: maximumSafeInteger, minimum: 1, type: 'integer' }, { type: 'null' }],
    },
  },
  required: [
    'byteSize',
    'createdAt',
    'documentId',
    'heightPixels',
    'mimeType',
    'originalFilename',
    'pageCount',
    'receiptId',
    'sha256',
    'sourceType',
    'widthPixels',
  ],
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
    storage: { enum: ['postgresql', 'process-memory'], type: 'string' },
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
export const receiptIdOnlyParamsSchema = z.object({ receiptId: z.string().uuid() }).strict();
export const receiptDocumentParamsSchema = z
  .object({ documentId: z.string().uuid(), receiptId: z.string().uuid() })
  .strict();
export const developmentSessionBodySchema = z.object({ userId: z.string().uuid() }).strict();
export const uploadAttachmentBodySchema = z
  .object({
    bytesBase64: z
      .string()
      .min(4)
      .max(hostedAttachmentMaximumBase64Length)
      .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    documentId: z.string().uuid(),
    originalFilename: z.string().min(1).max(255),
    sourceType: z.enum(['camera', 'image_import', 'pdf_import']),
  })
  .strict();

export type CreateReceiptBody = z.infer<typeof createReceiptBodySchema>;

export interface ApiError {
  readonly code: string;
  readonly message: string;
}

export interface SessionResponse {
  readonly accessToken: string;
  readonly expiresInSeconds: number;
}

export interface ReceiptDocumentResponse {
  readonly byteSize: number;
  readonly createdAt: string;
  readonly documentId: string;
  readonly heightPixels: number | null;
  readonly mimeType: 'application/pdf' | 'image/jpeg' | 'image/png';
  readonly originalFilename: string;
  readonly pageCount: number;
  readonly receiptId: string;
  readonly sha256: string;
  readonly sourceType: 'camera' | 'image_import' | 'pdf_import';
  readonly widthPixels: number | null;
}

export type ReceiptResponse = Receipt;
