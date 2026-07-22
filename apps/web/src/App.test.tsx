// @vitest-environment jsdom
// SPDX-License-Identifier: GPL-3.0-only
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Receipt } from '@reimbursd/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './App.js';
import type { WebApi } from './api-client.js';

const receipt: Receipt = {
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
  notes: 'Synthetic test data',
  purchasedAt: '2026-07-18T12:00:00-06:00',
  sourceType: 'manual',
  subtotalMinor: 1_000,
  taxMinor: 80,
  tipMinor: 200,
  totalMinor: 1_280,
  updatedAt: '2026-07-18T18:00:00.000Z',
  version: 1,
};

afterEach(cleanup);

describe('hosted web workflow', () => {
  it('signs in, lists, searches, creates, and signs out without persistent credentials', async () => {
    const user = userEvent.setup();
    const api = createApi();
    const ids = ['10000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002'];
    api.createReceipt.mockImplementation(async (_token, input) => ({
      ...receipt,
      ...input,
      categoryId: null,
      createdAt: input.capturedAt,
      deletedAt: null,
      locationId: null,
      sourceType: 'manual',
      updatedAt: input.capturedAt,
      version: 1,
    }));
    render(
      <App
        api={api}
        idFactory={() => ids.shift() ?? ''}
        now={() => new Date('2026-07-19T18:00:00.000Z')}
      />,
    );

    expect(window.localStorage).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Synthetic Web Merchant')).toBeTruthy();
    expect(api.createDevelopmentSession).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-000000000001',
    );
    expect(api.listReceipts).toHaveBeenCalledWith('synthetic-access-token');

    await user.type(screen.getByRole('searchbox', { name: 'Search receipts' }), 'missing');
    expect(screen.getByText('No matching receipts')).toBeTruthy();
    await user.clear(screen.getByRole('searchbox', { name: 'Search receipts' }));
    await user.click(screen.getByRole('button', { name: 'New expense' }));
    const dialog = screen.getByRole('dialog', { name: 'New expense' });
    await user.type(within(dialog).getByLabelText('Merchant'), 'Second Synthetic Merchant');
    await user.clear(within(dialog).getByLabelText('Purchase date'));
    await user.type(within(dialog).getByLabelText('Purchase date'), '2026-07-19');
    await user.type(within(dialog).getByLabelText('Subtotal'), '10.00');
    await user.type(within(dialog).getByLabelText('Tax'), '0.80');
    await user.type(within(dialog).getByLabelText('Tip'), '2.00');
    expect(within(dialog).getByText('$12.80')).toBeTruthy();
    await user.click(within(dialog).getByRole('button', { name: 'Save expense' }));

    await waitFor(() =>
      expect(api.createReceipt).toHaveBeenCalledWith(
        'synthetic-access-token',
        expect.objectContaining({
          merchantName: 'Second Synthetic Merchant',
          subtotalMinor: 1_000,
          taxMinor: 80,
          tipMinor: 200,
          totalMinor: 1_280,
        }),
      ),
    );
    expect(await screen.findByText('Second Synthetic Merchant')).toBeTruthy();
    expect(window.localStorage).toHaveLength(0);
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('offers recovery when receipt listing fails', async () => {
    const user = userEvent.setup();
    const api = createApi();
    api.listReceipts.mockRejectedValue(new Error('Synthetic failure'));
    render(<App api={api} />);

    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Receipts could not be loaded.')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(api.listReceipts).toHaveBeenCalledTimes(2);
  });
});

function createApi() {
  return {
    createDevelopmentSession: vi.fn<WebApi['createDevelopmentSession']>(async () => ({
      accessToken: 'synthetic-access-token',
      expiresInSeconds: 900,
    })),
    createReceipt: vi.fn<WebApi['createReceipt']>(),
    listReceipts: vi.fn<WebApi['listReceipts']>(async () => [receipt]),
  };
}
