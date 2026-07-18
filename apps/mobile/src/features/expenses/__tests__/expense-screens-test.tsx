// SPDX-License-Identifier: GPL-3.0-only
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import type { ReceiptDeletionCoordinator } from '@reimbursd/attachments';
import {
  ReceiptConflictError,
  type CategoryRepository,
  type FieldEvidenceRepository,
  type ProcessingHistoryRepository,
  type ReceiptClassificationRepository,
  type ReceiptDocumentRepository,
  type ReceiptRepository,
  type TagRepository,
} from '@reimbursd/database';
import {
  createCategory,
  createManualReceipt,
  createTag,
  type ReceiptDocument,
} from '@reimbursd/domain';

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
    ChartColumn: MockIcon,
    Circle: MockIcon,
    Crosshair: MockIcon,
    FileImage: MockIcon,
    FileText: MockIcon,
    Filter: MockIcon,
    Pencil: MockIcon,
    Plus: MockIcon,
    RefreshCw: MockIcon,
    RotateCcw: MockIcon,
    ReceiptText: MockIcon,
    Save: MockIcon,
    Search: MockIcon,
    ShieldCheck: MockIcon,
    Square: MockIcon,
    Tags: MockIcon,
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

function createProcessingHistoryRepository(): jest.Mocked<ProcessingHistoryRepository> {
  return {
    complete: jest.fn(),
    create: jest.fn(),
    getById: jest.fn(),
    listByReceiptId: jest.fn().mockResolvedValue([]),
  };
}

function createEvidenceRepository(): jest.Mocked<FieldEvidenceRepository> {
  return {
    create: jest.fn(),
    createMany: jest.fn(),
    getPreferred: jest.fn(),
    listByReceiptId: jest.fn().mockResolvedValue([]),
  };
}

function createCategoryRepository(): jest.Mocked<CategoryRepository> {
  return {
    create: jest.fn(async (category) => category),
    delete: jest.fn(),
    getById: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };
}

function createTagRepository(): jest.Mocked<TagRepository> {
  return {
    create: jest.fn(async (tag) => tag),
    delete: jest.fn(),
    getById: jest.fn(),
    list: jest.fn().mockResolvedValue([]),
    update: jest.fn(),
  };
}

function createReceiptClassificationRepository(): jest.Mocked<ReceiptClassificationRepository> {
  return {
    getByReceiptId: jest.fn().mockResolvedValue({ category: null, receipt, tags: [] }),
    update: jest.fn().mockImplementation(async (input) => ({
      category: null,
      receipt: {
        ...receipt,
        categoryId: input.categoryId,
        updatedAt: input.updatedAt,
        version: receipt.version + 1,
      },
      tags: [],
    })),
  };
}

function createClassificationProps() {
  return {
    categoryRepository: createCategoryRepository(),
    onClassified: jest.fn(),
    receiptClassificationRepository: createReceiptClassificationRepository(),
    tagRepository: createTagRepository(),
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

function createAttachmentStorage() {
  return {
    openForDisplay: jest.fn().mockResolvedValue({
      release: jest.fn(),
      uri: 'blob:synthetic-receipt-preview',
    }),
  };
}

describe('manual expense screens', () => {
  test('lists local expenses and exposes the primary create action', async () => {
    const onCreate = jest.fn();
    const onOpen = jest.fn();
    const onOpenReports = jest.fn();
    const repository = createRepository();
    const onCapture = jest.fn();
    const onImportImage = jest.fn();
    const onImportPdf = jest.fn();
    const screen = await render(
      <ExpenseListScreen
        categoryRepository={createCategoryRepository()}
        cleanupIssue={null}
        importError={null}
        importing={false}
        onCapture={onCapture}
        onCreate={onCreate}
        onImportImage={onImportImage}
        onImportPdf={onImportPdf}
        onOpen={onOpen}
        onOpenReports={onOpenReports}
        onRetryCleanup={jest.fn()}
        repository={repository}
        retryingCleanup={false}
        tagRepository={createTagRepository()}
      />,
    );

    await waitFor(() => expect(screen.getByText('Corner Market')).toBeTruthy());
    expect(screen.getByLabelText('Local mode, no account required')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('Create manual expense'));
    expect(onCreate).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Corner Market, $13.34'));
    expect(onOpen).toHaveBeenCalledWith(receipt);

    await fireEvent.press(screen.getByLabelText('View expense reports'));
    expect(onOpenReports).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByLabelText('Scan receipt with camera'));
    await fireEvent.press(screen.getByLabelText('Import receipt image'));
    await fireEvent.press(screen.getByLabelText('Import receipt PDF'));
    expect(onCapture).toHaveBeenCalledTimes(1);
    expect(onImportImage).toHaveBeenCalledTimes(1);
    expect(onImportPdf).toHaveBeenCalledTimes(1);
  });

  test('applies combined local date, category, tag, currency, and amount filters', async () => {
    const repository = createRepository();
    const categoryRepository = createCategoryRepository();
    const tagRepository = createTagRepository();
    const category = createCategory({
      createdAt: '2026-07-17T12:00:00-06:00',
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      name: 'Client Meals',
    });
    const tag = createTag({
      createdAt: '2026-07-17T12:00:00-06:00',
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      name: 'Reimbursable',
    });
    categoryRepository.list.mockResolvedValue([category]);
    tagRepository.list.mockResolvedValue([tag]);
    const screen = await render(
      <ExpenseListScreen
        categoryRepository={categoryRepository}
        cleanupIssue={null}
        importError={null}
        importing={false}
        onCapture={jest.fn()}
        onCreate={jest.fn()}
        onImportImage={jest.fn()}
        onImportPdf={jest.fn()}
        onOpen={jest.fn()}
        onOpenReports={jest.fn()}
        onRetryCleanup={jest.fn()}
        repository={repository}
        retryingCleanup={false}
        tagRepository={tagRepository}
      />,
    );

    await waitFor(() => expect(screen.getByText('Corner Market')).toBeTruthy());
    await fireEvent.press(screen.getByLabelText('Filter expenses, 0 active'));
    expect(await screen.findByText('Filter expenses')).toBeTruthy();

    await fireEvent.press(screen.getByLabelText('USD currencies, not selected'));
    await fireEvent.changeText(screen.getByLabelText('From date'), '2026-07-01');
    await fireEvent.changeText(screen.getByLabelText('Minimum total'), '10.00');
    await fireEvent.changeText(screen.getByLabelText('Maximum total'), '20.00');
    await fireEvent.press(screen.getByLabelText('Client Meals, not selected'));
    await fireEvent.press(screen.getByLabelText('Reimbursable, not selected'));
    await fireEvent.press(screen.getByLabelText('Apply expense filters'));

    await waitFor(() =>
      expect(repository.list).toHaveBeenLastCalledWith({
        categoryId: category.id,
        currencyCode: 'USD',
        maximumTotalMinor: 2_000,
        minimumTotalMinor: 1_000,
        purchasedFrom: '2026-07-01',
        search: '',
        tagId: tag.id,
      }),
    );
    expect(screen.getByLabelText('Filter expenses, 5 active')).toBeTruthy();
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
        categoryRepository={createCategoryRepository()}
        cleanupIssue="1 local receipt file still needs deletion."
        importError={null}
        importing={false}
        onCapture={jest.fn()}
        onCreate={jest.fn()}
        onImportImage={jest.fn()}
        onImportPdf={jest.fn()}
        onOpen={jest.fn()}
        onOpenReports={jest.fn()}
        onRetryCleanup={onRetryCleanup}
        repository={createRepository()}
        retryingCleanup={false}
        tagRepository={createTagRepository()}
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

  test('prefills reviewed suggestions before saving the structured expense', async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const suggestion = {
      acceptedAt: null,
      boundingBox: null,
      confidence: 0.92,
      correctedAt: null,
      extractedValue: 'Updated Market',
      fieldName: 'merchant_name',
      id: '77777777-7777-4777-8777-777777777777',
      normalizedValue: 'Updated Market',
      pageNumber: null,
      processedAt: '2026-07-15T12:01:00.000Z',
      processorName: 'reimbursd-deterministic-parser',
      processorVersion: '1.0.0',
      receiptId: receipt.id,
      sourceType: 'deterministic_parser',
    } as const;
    const screen = await render(
      <ExpenseFormScreen onSubmit={onSubmit} receipt={receipt} suggestions={[suggestion]} />,
    );

    expect(screen.getByText('Review receipt')).toBeTruthy();
    expect(screen.getByDisplayValue('Updated Market')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Save reviewed expense'));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({ merchantName: 'Updated Market' }),
        kind: 'update',
      }),
    );
  });

  test('requires confirmation before deleting an expense', async () => {
    const onDeleted = jest.fn();
    const deletionCoordinator = createDeletionCoordinator();
    const screen = await render(
      <ExpenseDetailScreen
        attachmentStorage={createAttachmentStorage()}
        {...createClassificationProps()}
        deletionCoordinator={deletionCoordinator}
        documentRepository={createDocumentRepository()}
        evidenceRepository={createEvidenceRepository()}
        onCleanupNeeded={jest.fn()}
        onDeleted={onDeleted}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={createProcessingHistoryRepository()}
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
        attachmentStorage={createAttachmentStorage()}
        {...createClassificationProps()}
        deletionCoordinator={deletionCoordinator}
        documentRepository={createDocumentRepository()}
        evidenceRepository={createEvidenceRepository()}
        onCleanupNeeded={onCleanupNeeded}
        onDeleted={onDeleted}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={createProcessingHistoryRepository()}
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
        attachmentStorage={createAttachmentStorage()}
        {...createClassificationProps()}
        deletionCoordinator={createDeletionCoordinator()}
        documentRepository={documentRepository}
        evidenceRepository={createEvidenceRepository()}
        onCleanupNeeded={jest.fn()}
        onDeleted={jest.fn()}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={createProcessingHistoryRepository()}
        receipt={receipt}
      />,
    );

    expect(await screen.findByText('synthetic-receipt.pdf')).toBeTruthy();
    expect(screen.getByText('PDF import | 3 pages | 4.0 KB')).toBeTruthy();
    expect(screen.getByText(`SHA-256 ${'d'.repeat(64)}`)).toBeTruthy();
    expect(screen.getByLabelText('Receipt imported and preserved locally')).toBeTruthy();
  });

  test('renders a generated derivative while keeping original metadata distinct', async () => {
    const imageOriginal: ReceiptDocument = {
      ...receiptDocument,
      heightPixels: 2_400,
      mimeType: 'image/jpeg',
      originalFilename: 'synthetic-receipt.jpg',
      pageCount: 1,
      sourceType: 'image_import',
      storageReference: `receipt-documents/${receipt.id}/originals/44444444-4444-4444-8444-444444444444.jpg`,
      widthPixels: 1_800,
    };
    const preview: ReceiptDocument = {
      ...imageOriginal,
      byteSize: 1_024,
      heightPixels: 1_600,
      id: '55555555-5555-4555-8555-555555555555',
      isOriginal: false,
      originalFilename: 'receipt-preview.jpg',
      parentDocumentId: imageOriginal.id,
      sha256: 'e'.repeat(64),
      sourceType: 'derivative',
      storageReference: `receipt-documents/${receipt.id}/derivatives/55555555-5555-4555-8555-555555555555.jpg`,
      widthPixels: 1_200,
    };
    const attachmentStorage = createAttachmentStorage();
    const documentRepository = createDocumentRepository();
    const evidenceRepository = createEvidenceRepository();
    const processingHistoryRepository = createProcessingHistoryRepository();
    const onEdit = jest.fn();
    documentRepository.listByReceiptId.mockResolvedValue([imageOriginal, preview]);
    const totalSuggestion = {
      acceptedAt: null,
      boundingBox: { height: 0.04, width: 0.18, x: 0.7, y: 0.82 },
      confidence: 0.91,
      correctedAt: null,
      extractedValue: '$14.34',
      fieldName: 'total_minor',
      id: '77777777-7777-4777-8777-777777777777',
      normalizedValue: '1434',
      pageNumber: 1,
      processedAt: '2026-07-15T12:00:02.000Z',
      processorName: 'reimbursd-deterministic-parser',
      processorVersion: '1.0.0',
      receiptId: receipt.id,
      sourceType: 'deterministic_parser',
    } as const;
    evidenceRepository.listByReceiptId.mockResolvedValue([totalSuggestion]);
    processingHistoryRepository.listByReceiptId.mockResolvedValue([
      {
        affectedFields: [],
        completedAt: '2026-07-15T12:00:01.000Z',
        executionLocation: 'local',
        failureCode: null,
        id: '66666666-6666-4666-8666-666666666666',
        modelVersion: null,
        processorName: 'reimbursd-receipt-ocr',
        processorVersion: '1.0.0',
        providerName: 'reimbursd-apple-vision-ocr',
        receiptId: receipt.id,
        reviewStatus: 'not_applicable',
        startedAt: '2026-07-15T12:00:00.000Z',
        status: 'succeeded',
      },
      {
        affectedFields: ['total_minor'],
        completedAt: '2026-07-15T12:00:02.000Z',
        executionLocation: 'local',
        failureCode: null,
        id: '88888888-8888-4888-8888-888888888888',
        modelVersion: null,
        processorName: 'reimbursd-deterministic-parser',
        processorVersion: '1.0.0',
        providerName: 'reimbursd-local-parser',
        receiptId: receipt.id,
        reviewStatus: 'pending',
        startedAt: '2026-07-15T12:00:01.000Z',
        status: 'succeeded',
      },
    ]);
    const screen = await render(
      <ExpenseDetailScreen
        attachmentStorage={attachmentStorage}
        {...createClassificationProps()}
        deletionCoordinator={createDeletionCoordinator()}
        documentRepository={documentRepository}
        evidenceRepository={evidenceRepository}
        onCleanupNeeded={jest.fn()}
        onDeleted={jest.fn()}
        onEdit={onEdit}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={processingHistoryRepository}
        receipt={receipt}
      />,
    );

    expect(await screen.findByLabelText('Generated local receipt preview')).toBeTruthy();
    expect(await screen.findByText('Suggested values ready')).toBeTruthy();
    expect(screen.getByText('1 local field to verify')).toBeTruthy();
    expect(screen.getByText('Suggested values')).toBeTruthy();
    expect(screen.getByText('Local deterministic parser | 91% confidence')).toBeTruthy();
    expect(screen.getByText('Saved values')).toBeTruthy();
    expect(screen.getByText('$14.34')).toBeTruthy();
    expect(screen.getAllByText('$13.34')).toHaveLength(2);
    expect(attachmentStorage.openForDisplay).toHaveBeenCalledWith(preview.storageReference);
    expect(screen.getByText('Original')).toBeTruthy();
    expect(screen.getByText('Derived')).toBeTruthy();

    await fireEvent(screen.getByLabelText('Generated local receipt preview'), 'layout', {
      nativeEvent: { layout: { height: 400, width: 300 } },
    });
    await fireEvent.press(
      screen.getByLabelText('Suggested Total, $14.34, 91% confidence, processed locally'),
    );
    await waitFor(() => expect(screen.getByLabelText('Receipt source highlight')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Review suggestions'));
    expect(onEdit).toHaveBeenCalledWith(
      [totalSuggestion],
      ['88888888-8888-4888-8888-888888888888'],
    );
  });

  test('keeps reviewed user corrections authoritative over later automation', async () => {
    const evidenceRepository = createEvidenceRepository();
    evidenceRepository.listByReceiptId.mockResolvedValue([
      {
        acceptedAt: null,
        boundingBox: null,
        confidence: 0.99,
        correctedAt: null,
        extractedValue: '$99.00',
        fieldName: 'total_minor',
        id: '77777777-7777-4777-8777-777777777777',
        normalizedValue: '9900',
        pageNumber: null,
        processedAt: '2026-07-15T12:10:00.000Z',
        processorName: 'reimbursd-deterministic-parser',
        processorVersion: '1.0.0',
        receiptId: receipt.id,
        sourceType: 'deterministic_parser',
      },
      {
        acceptedAt: null,
        boundingBox: null,
        confidence: 1,
        correctedAt: '2026-07-15T12:05:00.000Z',
        extractedValue: '1334',
        fieldName: 'total_minor',
        id: '99999999-9999-4999-8999-999999999999',
        normalizedValue: '1334',
        pageNumber: null,
        processedAt: '2026-07-15T12:05:00.000Z',
        processorName: 'reimbursd-user-review',
        processorVersion: '1.0.0',
        receiptId: receipt.id,
        sourceType: 'user_correction',
      },
    ]);
    const screen = await render(
      <ExpenseDetailScreen
        attachmentStorage={createAttachmentStorage()}
        {...createClassificationProps()}
        deletionCoordinator={createDeletionCoordinator()}
        documentRepository={createDocumentRepository()}
        evidenceRepository={evidenceRepository}
        onCleanupNeeded={jest.fn()}
        onDeleted={jest.fn()}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={createProcessingHistoryRepository()}
        receipt={receipt}
      />,
    );

    await waitFor(() => expect(evidenceRepository.listByReceiptId).toHaveBeenCalled());
    expect(screen.queryByText('Suggested values')).toBeNull();
    expect(screen.getByLabelText('Edit expense')).toBeTruthy();
  });

  test('creates and atomically assigns a category and tag from expense details', async () => {
    const classificationProps = createClassificationProps();
    const screen = await render(
      <ExpenseDetailScreen
        attachmentStorage={createAttachmentStorage()}
        {...classificationProps}
        deletionCoordinator={createDeletionCoordinator()}
        documentRepository={createDocumentRepository()}
        evidenceRepository={createEvidenceRepository()}
        onCleanupNeeded={jest.fn()}
        onDeleted={jest.fn()}
        onEdit={jest.fn()}
        onRefreshCleanup={jest.fn().mockResolvedValue(undefined)}
        processingHistoryRepository={createProcessingHistoryRepository()}
        receipt={receipt}
      />,
    );

    await waitFor(() =>
      expect(classificationProps.receiptClassificationRepository.getByReceiptId).toHaveBeenCalled(),
    );
    await fireEvent.press(screen.getByLabelText('Classify expense'));
    expect(await screen.findByText('Classify expense')).toBeTruthy();

    await fireEvent.changeText(screen.getByLabelText('New category name'), 'Client Meals');
    await fireEvent.press(screen.getByLabelText('Add new category'));
    await waitFor(() => expect(screen.getByLabelText('Client Meals, selected')).toBeTruthy());

    await fireEvent.changeText(screen.getByLabelText('New tag name'), 'Reimbursable');
    await fireEvent.press(screen.getByLabelText('Add new tag'));
    await waitFor(() => expect(screen.getByLabelText('Reimbursable, selected')).toBeTruthy());

    await fireEvent.press(screen.getByLabelText('Save expense classification'));
    await waitFor(() =>
      expect(classificationProps.receiptClassificationRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({
          categoryId: '11111111-1111-4111-8111-111111111111',
          expectedVersion: receipt.version,
          receiptId: receipt.id,
          tagIds: ['11111111-1111-4111-8111-111111111111'],
        }),
      ),
    );
    expect(classificationProps.onClassified).toHaveBeenCalledTimes(1);
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
