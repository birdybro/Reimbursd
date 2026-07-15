// SPDX-License-Identifier: GPL-3.0-only
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ReceiptDeletionCoordinator } from '@reimbursd/attachments';
import {
  ReceiptConflictError,
  type ReceiptDocumentRepository,
  type ReceiptRepository,
} from '@reimbursd/database';
import { createManualReceipt, type ReceiptDocument } from '@reimbursd/domain';

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
    Camera: MockIcon,
    FileImage: MockIcon,
    FileText: MockIcon,
    Filter: MockIcon,
    Pencil: MockIcon,
    Plus: MockIcon,
    RefreshCw: MockIcon,
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

const receiptDocument: ReceiptDocument = {
  byteSize: 4_096,
  createdAt: '2026-07-15T01:00:00.000Z',
  heightPixels: null,
  id: '44444444-4444-4444-8444-444444444444',
  isOriginal: true,
  mimeType: 'application/pdf',
  originalFilename: 'synthetic-receipt.pdf',
  pageCount: 3,
  parentDocumentId: null,
  receiptId: receipt.id,
  sha256: 'd'.repeat(64),
  sourceType: 'pdf_import',
  storageDeletedAt: null,
  storageReference: `receipt-documents/${receipt.id}/originals/44444444-4444-4444-8444-444444444444.pdf`,
  widthPixels: null,
};

function createRepository(): jest.Mocked<ReceiptRepository> {
  return {
    create: jest.fn(),
    delete: jest.fn(),
    getById: jest.fn(),
    list: jest.fn().mockResolvedValue([receipt]),
    update: jest.fn(),
  };
}

function createDocumentRepository(): jest.Mocked<ReceiptDocumentRepository> {
  return {
    create: jest.fn(),
    findOriginalByHash: jest.fn(),
    getById: jest.fn(),
    listByReceiptId: jest.fn().mockResolvedValue([]),
    listPendingStorageDeletion: jest.fn().mockResolvedValue([]),
    markStorageDeleted: jest.fn(),
  };
}

function createDeletionCoordinator(): jest.Mocked<
  Pick<ReceiptDeletionCoordinator, 'cleanupDocuments' | 'deleteReceipt'>
> {
  return {
    cleanupDocuments: jest.fn().mockResolvedValue([]),
    deleteReceipt: jest.fn().mockResolvedValue({
      attachmentCleanupFailures: [],
      receipt: { ...receipt, deletedAt: '2026-07-15T00:00:00.000Z', version: 2 },
    }),
  };
}

describe('manual expense screens', () => {
  test('lists local expenses and exposes the primary create action', async () => {
    const onCreate = jest.fn();
    const onOpen = jest.fn();
    const repository = createRepository();
    const onCapture = jest.fn();
    const onImportImage = jest.fn();
    const onImportPdf = jest.fn();
    const screen = await render(
      <ExpenseListScreen
        cleanupIssue={null}
        importError={null}
        importing={false}
        onCapture={onCapture}
        onCreate={onCreate}
        onImportImage={onImportImage}
        onImportPdf={onImportPdf}
        onOpen={onOpen}
        onRetryCleanup={jest.fn()}
        repository={repository}
        retryingCleanup={false}
      />,
    );

    await waitFor(() => expect(screen.getByText('Corner Market')).toBeTruthy());
    expect(screen.getByLabelText('Local mode, no account required')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Create manual expense'));
    expect(onCreate).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Corner Market, $13.34'));
    expect(onOpen).toHaveBeenCalledWith(receipt);

    await fireEvent.press(screen.getByLabelText('Scan receipt with camera'));
    await fireEvent.press(screen.getByLabelText('Import receipt image'));
    await fireEvent.press(screen.getByLabelText('Import receipt PDF'));
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onImportImage).toHaveBeenCalledTimes(1);
    expect(onImportPdf).toHaveBeenCalledTimes(1);
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

  test('exposes retry when local receipt file deletion is pending', async () => {
    const onRetryCleanup = jest.fn();
    const screen = await render(
      <ExpenseListScreen
        cleanupIssue="1 local receipt file still needs deletion."
        importError={null}
        importing={false}
        onCapture={jest.fn()}
        onCreate={jest.fn()}
        onImportImage={jest.fn()}
        onImportPdf={jest.fn()}
        onOpen={jest.fn()}
        onRetryCleanup={onRetryCleanup}
        repository={createRepository()}
        retryingCleanup={false}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Retry receipt file deletion'));
    expect(onRetryCleanup).toHaveBeenCalledTimes(1);
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
    const deletionCoordinator = createDeletionCoordinator();
    const screen = await render(
      <ExpenseDetailScreen
        deletionCoordinator={deletionCoordinator}
        documentRepository={createDocumentRepository()}
        onCleanupNeeded={jest.fn()}
        onDeleted={onDeleted}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        receipt={receipt}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Delete expense'));
    expect(screen.getByText('Delete expense?')).toBeTruthy();
    expect(deletionCoordinator.deleteReceipt).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Confirm expense deletion'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deletionCoordinator.deleteReceipt).toHaveBeenCalledWith(
      receipt.id,
      receipt.version,
      expect.any(String),
    );
  });

  test('keeps a failed attachment cleanup recoverable after the expense is removed', async () => {
    const onCleanupNeeded = jest.fn();
    const onDeleted = jest.fn();
    const deletionCoordinator = createDeletionCoordinator();
    deletionCoordinator.deleteReceipt.mockResolvedValueOnce({
      attachmentCleanupFailures: [
        { document: receiptDocument, error: new Error('Synthetic storage failure.') },
      ],
      receipt: { ...receipt, deletedAt: '2026-07-15T00:00:00.000Z', version: 2 },
    });
    const screen = await render(
      <ExpenseDetailScreen
        deletionCoordinator={deletionCoordinator}
        documentRepository={createDocumentRepository()}
        onCleanupNeeded={onCleanupNeeded}
        onDeleted={onDeleted}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        receipt={receipt}
      />,
    );

    await fireEvent.press(screen.getByLabelText('Delete expense'));
    await fireEvent.press(screen.getByLabelText('Confirm expense deletion'));

    expect(
      await screen.findByText(
        'The expense record was removed, but 1 local receipt file still needs deletion. Retry now or from the expense list.',
      ),
    ).toBeTruthy();
    expect(onCleanupNeeded).toHaveBeenCalledTimes(1);
    expect(onDeleted).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByLabelText('Retry receipt file deletion'));
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(deletionCoordinator.cleanupDocuments).toHaveBeenCalledWith([receiptDocument]);
  });

  test('shows original receipt provenance and file integrity metadata', async () => {
    const documentRepository = createDocumentRepository();
    documentRepository.listByReceiptId.mockResolvedValue([receiptDocument]);
    const screen = await render(
      <ExpenseDetailScreen
        deletionCoordinator={createDeletionCoordinator()}
        documentRepository={documentRepository}
        onCleanupNeeded={jest.fn()}
        onDeleted={jest.fn()}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        receipt={receipt}
      />,
    );

    expect(await screen.findByText('synthetic-receipt.pdf')).toBeTruthy();
    expect(screen.getByText('PDF import | 3 pages | 4.0 KB')).toBeTruthy();
    expect(screen.getByText(`SHA-256 ${'d'.repeat(64)}`)).toBeTruthy();
    expect(screen.getByLabelText('Receipt imported and preserved locally')).toBeTruthy();
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
