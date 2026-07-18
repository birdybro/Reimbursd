// SPDX-License-Identifier: GPL-3.0-only
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ExpenseReportRepository } from '@reimbursd/database';
import { createCategory } from '@reimbursd/domain';

import { ExpenseReportScreen } from '../ExpenseReportScreen';

jest.mock('lucide-react-native', () => {
  const MockIcon = () => null;
  return { ChartColumn: MockIcon, CircleAlert: MockIcon };
});

const category = createCategory({
  createdAt: '2026-07-17T12:00:00-06:00',
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  name: 'Client meals',
});

function createRepository(): jest.Mocked<ExpenseReportRepository> {
  return {
    getTotals: jest.fn().mockResolvedValue({
      categoryTotals: [
        { category, currencyCode: 'USD', receiptCount: 2, totalMinor: 2_000 },
        { category: null, currencyCode: 'USD', receiptCount: 1, totalMinor: 450 },
        { category, currencyCode: 'CAD', receiptCount: 1, totalMinor: 700 },
      ],
      monthlyTotals: [
        { currencyCode: 'CAD', month: '2026-07', receiptCount: 1, totalMinor: 700 },
        { currencyCode: 'USD', month: '2026-07', receiptCount: 3, totalMinor: 2_450 },
      ],
    }),
  };
}

describe('expense reports', () => {
  test('renders monthly and category totals without combining currencies', async () => {
    const screen = await render(<ExpenseReportScreen repository={createRepository()} />);

    expect(await screen.findByText('Monthly totals')).toBeTruthy();
    expect(screen.getAllByText('July 2026')).toHaveLength(2);
    expect(screen.getByLabelText('July 2026, 1 expense, CA$7.00')).toBeTruthy();
    expect(screen.getByLabelText('July 2026, 3 expenses, $24.50')).toBeTruthy();
    expect(screen.getByLabelText('Client meals, 2 expenses, $20.00')).toBeTruthy();
    expect(screen.getByLabelText('Uncategorized, 1 expense, $4.50')).toBeTruthy();
  });

  test('recovers from a local reporting read failure', async () => {
    const repository = createRepository();
    repository.getTotals
      .mockRejectedValueOnce(new Error('synthetic read failure'))
      .mockResolvedValueOnce({ categoryTotals: [], monthlyTotals: [] });
    const screen = await render(<ExpenseReportScreen repository={repository} />);

    expect(await screen.findByText('Could not load totals')).toBeTruthy();
    await fireEvent.press(screen.getByText('Try again'));

    await waitFor(() => expect(repository.getTotals).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('No totals yet')).toBeTruthy();
  });
});
