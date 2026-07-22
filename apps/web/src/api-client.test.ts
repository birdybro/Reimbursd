// SPDX-License-Identifier: GPL-3.0-only
import { describe, expect, it, vi } from 'vitest';
import { ReimbursdWebApi } from './api-client.js';

const receipt = {
  capturedAt: '2026-07-18T18:00:00.000Z',
  categoryId: null,
  createdAt: '2026-07-18T18:00:00.000Z',
  currencyCode: 'USD',
  deletedAt: null,
  discountMinor: 0,
  id: '10000000-0000-4000-8000-000000000001',
  locationId: null,
  merchantId: '20000000-0000-4000-8000-000000000001',
  merchantName: 'Synthetic Web Merchant',
  notes: '',
  purchasedAt: '2026-07-18T12:00:00-06:00',
  sourceType: 'manual',
  subtotalMinor: 1_000,
  taxMinor: 80,
  tipMinor: 200,
  totalMinor: 1_280,
  updatedAt: '2026-07-18T18:00:00.000Z',
  version: 1,
} as const;

describe('ReimbursdWebApi', () => {
  it('invokes fetch with its required global receiver', async () => {
    let receiver: unknown;
    const request = function (this: unknown) {
      receiver = this;
      return Promise.resolve(jsonResponse([receipt]));
    } as typeof fetch;

    await new ReimbursdWebApi({ fetch: request }).listReceipts('synthetic-token');

    expect(receiver).toBe(globalThis);
  });

  it('uses same-origin credential-omitting requests and validates responses', async () => {
    const request = vi.fn<typeof fetch>(async () => jsonResponse([receipt]));
    const api = new ReimbursdWebApi({ basePath: '/api', fetch: request });

    await expect(api.listReceipts('synthetic-token')).resolves.toEqual([receipt]);
    expect(request).toHaveBeenCalledWith(
      '/api/v1/receipts',
      expect.objectContaining({
        cache: 'no-store',
        credentials: 'omit',
        headers: expect.objectContaining({ authorization: 'Bearer synthetic-token' }),
        method: 'GET',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
      }),
    );
  });

  it('fails closed on malformed success and oversized responses', async () => {
    const malformed = new ReimbursdWebApi({
      fetch: vi.fn<typeof fetch>(async () => jsonResponse([{ ...receipt, totalMinor: '12.80' }])),
    });
    const oversized = new ReimbursdWebApi({
      fetch: vi.fn<typeof fetch>(async () =>
        jsonResponse({}, 200, { 'content-length': '1048577' }),
      ),
    });

    await expect(malformed.listReceipts('token')).rejects.toThrow();
    await expect(oversized.listReceipts('token')).rejects.toMatchObject({
      code: 'response_too_large',
    });
  });

  it('fails closed when a receipt violates shared domain invariants', async () => {
    const api = new ReimbursdWebApi({
      fetch: vi.fn<typeof fetch>(async () => jsonResponse([{ ...receipt, totalMinor: 1_279 }])),
    });

    await expect(api.listReceipts('token')).rejects.toMatchObject({
      code: 'invalid_response',
      status: 502,
    });
  });

  it('reduces API failures to bounded codes', async () => {
    const api = new ReimbursdWebApi({
      fetch: vi.fn<typeof fetch>(async () =>
        jsonResponse({ code: 'unauthorized', message: 'A valid bearer token is required.' }, 401),
      ),
    });

    await expect(api.listReceipts('expired-token')).rejects.toEqual(
      expect.objectContaining({ code: 'unauthorized', status: 401 }),
    );
  });

  it('rejects absolute or protocol-relative API locations', () => {
    expect(() => new ReimbursdWebApi({ basePath: 'https://api.example.test' })).toThrow(
      'same-origin path',
    );
    expect(() => new ReimbursdWebApi({ basePath: '//api' })).toThrow('same-origin path');
  });
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json', ...headers },
    status,
  });
}
