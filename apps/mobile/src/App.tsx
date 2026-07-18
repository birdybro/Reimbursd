// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { randomUUID } from 'expo-crypto';

import {
  AttachmentIngestor,
  AttachmentPreviewWriter,
  PdfLibAttachmentInspector,
  ReceiptDeletionCoordinator,
} from '@reimbursd/attachments';
import { schemaVersion } from '@reimbursd/database';
import type { FieldEvidence, Receipt } from '@reimbursd/domain';
import { DeterministicReceiptParser, type DateOrder } from '@reimbursd/extraction';

import { AppHeader } from './components/AppHeader';
import { LegalModal } from './components/LegalModal';
import { StatusPanel } from './components/StatusPanel';
import { ExpenseDetailScreen } from './features/expenses/ExpenseDetailScreen';
import { ExpenseFormScreen } from './features/expenses/ExpenseFormScreen';
import { ExpenseListScreen } from './features/expenses/ExpenseListScreen';
import { ExpenseReportScreen } from './features/expenses/ExpenseReportScreen';
import { exportExpenseCsv } from './features/expenses/expense-csv-export';
import { exportStructuredData } from './features/expenses/structured-export';
import type { ExpenseFormSubmission } from './features/expenses/expense-form';
import { buildReceiptReviewInput } from './features/expenses/expense-review';
import {
  getReceiptImportErrorMessage,
  ReceiptCaptureCoordinator,
} from './features/receipts/receipt-capture';
import { AppleVisionOcrProvider } from './features/receipts/local-ocr-provider';
import { LocalReceiptOcrProcessor } from './features/receipts/receipt-ocr';
import { ExpoReceiptPreviewCreator } from './features/receipts/receipt-preview';
import {
  selectCameraReceipt,
  selectImageReceipt,
  selectPdfReceipt,
  ReceiptPickerPermissionError,
  type SelectedReceiptFile,
} from './features/receipts/receipt-pickers';
import { getLocalRepositories, type LocalRepositories } from './storage/expo-sqlite';
import { ExpoAttachmentHasher, LocalAttachmentStorage } from './storage/local-attachments';
import { PlatformCsvExportWriter } from './storage/local-csv-export';
import { PlatformStructuredExportWriter } from './storage/local-structured-export';
import { colors } from './theme';
import appConfig from '../app.json';

type Route =
  | { readonly name: 'list' }
  | { readonly name: 'detail'; readonly receipt: Receipt }
  | { readonly name: 'new' }
  | { readonly name: 'reports' }
  | {
      readonly name: 'edit';
      readonly processingHistoryIds: readonly string[];
      readonly receipt: Receipt;
      readonly suggestions: readonly FieldEvidence[];
    };

type RepositoryState =
  | { readonly status: 'loading' }
  | {
      readonly capture: ReceiptCaptureCoordinator;
      readonly deletion: ReceiptDeletionCoordinator;
      readonly ocr: LocalReceiptOcrProcessor;
      readonly repositories: LocalRepositories;
      readonly status: 'ready';
      readonly storage: LocalAttachmentStorage;
    }
  | { readonly status: 'error' };

function AppContent() {
  const [initializationKey, setInitializationKey] = useState(0);
  const [legalVisible, setLegalVisible] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [cleanupIssue, setCleanupIssue] = useState<string | null>(null);
  const [retryingCleanup, setRetryingCleanup] = useState(false);
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({ status: 'loading' });
  const [route, setRoute] = useState<Route>({ name: 'list' });

  useEffect(() => {
    let active = true;

    getLocalRepositories()
      .then(async (repositories) => {
        if (active) {
          const storage = new LocalAttachmentStorage();
          const hasher = new ExpoAttachmentHasher();
          const inspector = new PdfLibAttachmentInspector();
          const previewer = new ExpoReceiptPreviewCreator(
            new AttachmentPreviewWriter({
              documents: repositories.documents,
              hasher,
              inspector,
              storage,
            }),
          );
          const capture = new ReceiptCaptureCoordinator({
            ingestor: new AttachmentIngestor({
              documents: repositories.documents,
              hasher,
              inspector,
              storage,
            }),
            previewer,
            receipts: repositories.receipts,
          });
          const deletion = new ReceiptDeletionCoordinator({
            documents: repositories.documents,
            receipts: repositories.receipts,
            storage,
          });
          const ocr = new LocalReceiptOcrProcessor({
            evidence: repositories.evidence,
            history: repositories.processingHistory,
            parser: new DeterministicReceiptParser(),
            provider: new AppleVisionOcrProvider(),
            storage,
          });
          const cleanupFailures = await deletion.cleanupPending().catch(() => null);

          if (!active) {
            return;
          }

          setCleanupIssue(getCleanupIssue(cleanupFailures));
          setRepositoryState({ capture, deletion, ocr, repositories, status: 'ready', storage });
        }
      })
      .catch(() => {
        if (active) {
          setRepositoryState({ status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [initializationKey]);

  const goBack = () => {
    setRoute((current) => {
      if (current.name === 'edit') {
        return { name: 'detail', receipt: current.receipt };
      }
      return { name: 'list' };
    });
  };

  const submit = async (submission: ExpenseFormSubmission) => {
    if (repositoryState.status !== 'ready') {
      throw new Error('Local repository is unavailable.');
    }

    const receipt =
      submission.kind === 'create'
        ? await repositoryState.repositories.receipts.create(submission.receipt)
        : route.name === 'edit'
          ? await repositoryState.repositories.reviews.review(
              buildReceiptReviewInput({
                idFactory: randomUUID,
                processingHistoryIds: route.processingHistoryIds,
                receipt: route.receipt,
                suggestions: route.suggestions,
                update: submission.input,
              }),
            )
          : await repositoryState.repositories.receipts.update(submission.input);
    setRoute({ name: 'detail', receipt });
  };

  const importReceipt = async (
    picker: () => Promise<SelectedReceiptFile | null>,
  ): Promise<void> => {
    if (repositoryState.status !== 'ready' || importing) {
      return;
    }

    setImportError(null);

    try {
      const selection = await picker();

      if (selection === null) {
        return;
      }

      setImporting(true);
      const imported = await repositoryState.capture.import(selection);
      await repositoryState.ocr
        .process({
          document: imported.preview ?? imported.document,
          parserContext: {
            dateOrder: getLocalDateOrder(),
            defaultCurrencyCode: imported.receipt.currencyCode,
            timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          },
        })
        .catch(() => 'failed');
      setRoute({ name: 'detail', receipt: imported.receipt });
    } catch (error) {
      setImportError(
        error instanceof ReceiptPickerPermissionError
          ? error.message
          : getReceiptImportErrorMessage(error),
      );
    } finally {
      setImporting(false);
    }
  };

  const retryPendingCleanup = async (): Promise<void> => {
    if (repositoryState.status !== 'ready' || retryingCleanup) {
      return;
    }

    setRetryingCleanup(true);

    try {
      const failures = await repositoryState.deletion.cleanupPending();
      setCleanupIssue(getCleanupIssue(failures));
    } catch {
      setCleanupIssue(
        'Receipt file deletion could not be checked. Retry before clearing site data.',
      );
    } finally {
      setRetryingCleanup(false);
    }
  };

  const screenTitle =
    route.name === 'new'
      ? 'New expense'
      : route.name === 'edit'
        ? 'Edit expense'
        : route.name === 'detail'
          ? 'Expense details'
          : route.name === 'reports'
            ? 'Reports'
            : undefined;
  const showBack = route.name !== 'list';

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <AppHeader
        onBack={showBack ? goBack : undefined}
        onOpenLegal={() => setLegalVisible(true)}
        title={screenTitle}
      />

      <View style={styles.main}>
        {repositoryState.status === 'loading' ? (
          <View accessibilityLabel="Opening local expense database" style={styles.loading}>
            <ActivityIndicator color={colors.green} size="large" />
          </View>
        ) : repositoryState.status === 'error' ? (
          <StatusPanel
            actionLabel="Try again"
            message="The local database could not be opened. No data was sent anywhere."
            onAction={() => {
              setRepositoryState({ status: 'loading' });
              setInitializationKey((value) => value + 1);
            }}
            title="Local storage is unavailable"
          />
        ) : route.name === 'list' ? (
          <ExpenseListScreen
            categoryRepository={repositoryState.repositories.categories}
            cleanupIssue={cleanupIssue}
            importError={importError}
            importing={importing}
            onCapture={() => importReceipt(selectCameraReceipt)}
            onCreate={() => setRoute({ name: 'new' })}
            onExportArchive={async (includeOriginalAttachments) => {
              await exportStructuredData({
                applicationVersion: appConfig.expo.version,
                hasher: new ExpoAttachmentHasher(),
                includeOriginalAttachments,
                repository: repositoryState.repositories.structuredExports,
                schemaVersion,
                storage: repositoryState.storage,
                writer: new PlatformStructuredExportWriter(),
              });
            }}
            onExportCsv={async () => {
              await exportExpenseCsv({
                repository: repositoryState.repositories.receipts,
                writer: new PlatformCsvExportWriter(),
              });
            }}
            onImportImage={() => importReceipt(selectImageReceipt)}
            onImportPdf={() => importReceipt(selectPdfReceipt)}
            onOpen={(receipt) => setRoute({ name: 'detail', receipt })}
            onOpenReports={() => setRoute({ name: 'reports' })}
            onRetryCleanup={retryPendingCleanup}
            repository={repositoryState.repositories.receipts}
            retryingCleanup={retryingCleanup}
            tagRepository={repositoryState.repositories.tags}
          />
        ) : route.name === 'reports' ? (
          <ExpenseReportScreen repository={repositoryState.repositories.reports} />
        ) : route.name === 'detail' ? (
          <ExpenseDetailScreen
            attachmentStorage={repositoryState.storage}
            categoryRepository={repositoryState.repositories.categories}
            deletionCoordinator={repositoryState.deletion}
            documentRepository={repositoryState.repositories.documents}
            evidenceRepository={repositoryState.repositories.evidence}
            onCleanupNeeded={() =>
              setCleanupIssue(
                'An expense was removed, but at least one local receipt file still needs deletion.',
              )
            }
            onClassified={(receipt) => setRoute({ name: 'detail', receipt })}
            onDeleted={() => setRoute({ name: 'list' })}
            onEdit={(suggestions, processingHistoryIds) =>
              setRoute({
                name: 'edit',
                processingHistoryIds,
                receipt: route.receipt,
                suggestions,
              })
            }
            onRefreshCleanup={retryPendingCleanup}
            processingHistoryRepository={repositoryState.repositories.processingHistory}
            receiptClassificationRepository={repositoryState.repositories.receiptClassifications}
            receipt={route.receipt}
            tagRepository={repositoryState.repositories.tags}
          />
        ) : (
          <ExpenseFormScreen
            onSubmit={submit}
            receipt={route.name === 'edit' ? route.receipt : undefined}
            {...(route.name === 'edit' ? { suggestions: route.suggestions } : {})}
          />
        )}
      </View>

      <LegalModal onClose={() => setLegalVisible(false)} visible={legalVisible} />
    </SafeAreaView>
  );
}

function getLocalDateOrder(): DateOrder {
  const parts = new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  }).formatToParts(new Date(2001, 10, 22));
  const dayIndex = parts.findIndex(({ type }) => type === 'day');
  const monthIndex = parts.findIndex(({ type }) => type === 'month');

  return dayIndex >= 0 && monthIndex >= 0 && dayIndex < monthIndex ? 'dmy' : 'mdy';
}

function getCleanupIssue(failures: readonly unknown[] | null): string | null {
  if (failures === null) {
    return 'Receipt file deletion could not be checked. Retry before clearing site data.';
  }

  if (failures.length === 0) {
    return null;
  }

  return `${failures.length} local receipt ${failures.length === 1 ? 'file still needs' : 'files still need'} deletion.`;
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  main: {
    flex: 1,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
});
