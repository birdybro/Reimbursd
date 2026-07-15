// SPDX-License-Identifier: GPL-3.0-only
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ReceiptConflictError, type ReceiptRepository } from '@reimbursd/database';
import { createManualReceipt } from '@reimbursd/domain';

import { ExpenseFormScreen } from '../ExpenseFormScreen';
import { ExpenseDetailScreen } from '../ExpenseDetailScreen';
import { ExpenseListScreen } from '../ExpenseListScreen';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '11111111-1111-4111-8111-111111111111'),
}));

jest.mock('lucide-react-native', () => {
  const MockIcon = () => null;
  return {
    Check: MockIcon,
    Filter: MockIcon,
    Pencil: MockIcon,
    Plus: MockIcon,
    ReceiptText: MockIcon,
    Save: MockIcon,
    Search: MockIcon,
    ShieldCheck: MockIcon,
    Trash2: MockIcon,
    X: MockIcon,
  };
});

const receipt = createManualReceipt({
  capturedAt: '2026-07-14T18:00:00.000Z',
  currencyCode: 'USD',
  id: '22222222-2222-4222-8222-222222222222',
  merchantId: '33333333-3333-4333-8333-333333333333',
  merchantName: 'Corner Market',
  purchasedAt: '2026-07-14T12:00:00-06:00',
  subtotalMinor: 1_234,
  taxMinor: 100,
  tipMinor: 0,
  totalMinor: 1_334,
});

function createRepository(): jest.Mocked<ReceiptRepository> {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn(),
    list: jest.fn().mockResolvedValue([receipt]),
    update: jest.fn(),
  };
}

describe('manual expense screens', () => {
  test('lists local expenses and exposes the primary create action', async () => {
    const onCreate = jest.fn();
    const onOpen = jest.fn();
    const repository = createRepository();
    const screen = await render(
      <ExpenseListScreen onCreate={onCreate} onOpen={onOpen} repository={repository} />,
    );

    await waitFor(() => expect(screen.getByText('Corner Market')).toBeTruthy());
    expect(screen.getByLabelText('Local mode, no account required')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Create manual expense'));
    expect(onCreate).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Corner Market, $13.34'));
    expect(onOpen).toHaveBeenCalledWith(receipt);
  });

  test('validates and submits exact minor-unit amounts', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const screen = await render(<ExpenseFormScreen onSubmit={onSubmit} receipt={undefined} />);

    await fireEvent.changeText(screen.getByLabelText('Merchant'), 'Corner Market');
    await fireEvent.changeText(screen.getByLabelText('Subtotal'), '12.34');
    await fireEvent.changeText(screen.getByLabelText('Tax'), '1.00');
    await fireEvent.changeText(screen.getByLabelText('Tip'), '0.00');
    await fireEvent.changeText(screen.getByLabelText('Discount'), '0.00');
    await fireEvent.changeText(screen.getByLabelText('Total'), '13.34');
    await fireEvent.press(screen.getByLabelText('Save manual expense'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const submission: unknown = onSubmit.mock.calls[0]?.[0];
    expect(submission).toMatchObject({
      kind: 'create',
      receipt: {
        merchantName: 'Corner Market',
        subtotalMinor: 1_234,
        taxMinor: 100,
        totalMinor: 1_334,
      },
    });
  });

  test('keeps invalid entries visible with a recoverable message', async () => {
    const onSubmit = jest.fn();
    const screen = await render(<ExpenseFormScreen onSubmit={onSubmit} receipt={undefined} />);

    await fireEvent.changeText(screen.getByLabelText('Merchant'), 'Corner Market');
    await fireEvent.changeText(screen.getByLabelText('Subtotal'), '12.34');
    await fireEvent.changeText(screen.getByLabelText('Total'), '12.35');
    await fireEvent.press(screen.getByLabelText('Save manual expense'));

    expect(
      await screen.findByText('Total must equal subtotal plus tax and tip, less discount.'),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('12.35')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  test('requires confirmation before deleting an expense', async () => {
    const onDeleted = jest.fn();
    const repository = createRepository();
    repository.delete.mockResolvedValue({
      ...receipt,
      deletedAt: '2026-07-15T00:00:00.000Z',
      version: 2,
    });
    const screen = await render(
      <ExpenseDetailScreen
        onDeleted={onDeleted}
        onEdit={jest.fn()}
        receipt={receipt}
        repository={repository}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Delete expense'));
    expect(screen.getByText('Delete expense?')).toBeTruthy();
    expect(repository.delete).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Confirm expense deletion'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(repository.delete).toHaveBeenCalledWith(receipt.id, receipt.version, expect.any(String));
  });

  test('explains how to recover from a stale edit conflict', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new ReceiptConflictError());
    const screen = await render(<ExpenseFormScreen onSubmit={onSubmit} receipt={receipt} />);

    await fireEvent.press(screen.getByLabelText('Save expense changes'));

    expect(
      await screen.findByText(
        'This expense changed or was removed. Your entries are still here; go back and reopen the expense before editing again.',
      ),
    ).toBeTruthy();
    expect(screen.getByDisplayValue('Corner Market')).toBeTruthy();
  });
});
