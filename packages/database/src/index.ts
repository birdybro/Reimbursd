// SPDX-License-Identifier: GPL-3.0-only
export {
  migrateDatabase,
  schemaVersion,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';
export {
  ReceiptConflictError,
  ReceiptNotFoundError,
  ReceiptReviewConflictError,
  SqliteReceiptRepository,
  SqliteReceiptReviewRepository,
  type EvidenceReviewInput,
  type ReceiptListOptions,
  type ReceiptRepository,
  type ReceiptReviewRepository,
  type ReviewReceiptInput,
  type UpdateReceiptInput,
} from './receipt-repository.js';
export {
  ReceiptDocumentDuplicateError,
  ReceiptDocumentNotFoundError,
  ReceiptDocumentParentNotFoundError,
  ReceiptDocumentReceiptNotFoundError,
  ReceiptDocumentReceiptNotDeletedError,
  SqliteReceiptDocumentRepository,
  type ReceiptDocumentRepository,
} from './receipt-document-repository.js';
export {
  ProcessingHistoryConflictError,
  ProcessingHistoryNotFoundError,
  ProcessingReceiptNotFoundError,
  SqliteFieldEvidenceRepository,
  SqliteProcessingHistoryRepository,
  type CompleteProcessingHistoryInput,
  type FieldEvidenceRepository,
  type ProcessingHistoryRepository,
} from './processing-repository.js';
export {
  ClassificationConflictError,
  ClassificationDuplicateNameError,
  ClassificationInUseError,
  ClassificationNotFoundError,
  SqliteCategoryRepository,
  SqliteReceiptClassificationRepository,
  SqliteTagRepository,
  type CategoryRepository,
  type ReceiptClassification,
  type ReceiptClassificationRepository,
  type TagRepository,
  type UpdateClassificationInput,
  type UpdateReceiptClassificationInput,
} from './classification-repository.js';
export {
  SqliteExpenseReportRepository,
  type CategoryExpenseTotal,
  type ExpenseReportRepository,
  type ExpenseTotals,
  type MonthlyExpenseTotal,
} from './reporting-repository.js';
export {
  SqliteStructuredExportSnapshotRepository,
  type StructuredExportSnapshotRepository,
} from './structured-export-snapshot-repository.js';
export {
  SqliteStructuredImportRepository,
  StructuredImportTargetNotEmptyError,
  StructuredImportUnsupportedRecordsError,
  type StructuredImportRepository,
  type StructuredImportResult,
} from './structured-import-repository.js';
