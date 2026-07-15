// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AttachmentIngestor, PdfLibAttachmentInspector } from '@reimbursd/attachments';
import type { Receipt } from '@reimbursd/domain';

import { AppHeader } from './components/AppHeader';
import { LegalModal } from './components/LegalModal';
import { StatusPanel } from './components/StatusPanel';
import { ExpenseDetailScreen } from './features/expenses/ExpenseDetailScreen';
import { ExpenseFormScreen } from './features/expenses/ExpenseFormScreen';
import { ExpenseListScreen } from './features/expenses/ExpenseListScreen';
import type { ExpenseFormSubmission } from './features/expenses/expense-form';
import {
  getReceiptImportErrorMessage,
  ReceiptCaptureCoordinator,
} from './features/receipts/receipt-capture';
import {
  selectCameraReceipt,
  selectImageReceipt,
  selectPdfReceipt,
  ReceiptPickerPermissionError,
  type SelectedReceiptFile,
} from './features/receipts/receipt-pickers';
import { getLocalRepositories, type LocalRepositories } from './storage/expo-sqlite';
import { ExpoAttachmentHasher, LocalAttachmentStorage } from './storage/local-attachments';
import { colors } from './theme';

type Route =
  | { readonly name: 'list' }
  | { readonly name: 'detail'; readonly receipt: Receipt }
  | { readonly name: 'new' }
  | { readonly name: 'edit'; readonly receipt: Receipt };

type RepositoryState =
  | { readonly status: 'loading' }
  | {
      readonly capture: ReceiptCaptureCoordinator;
      readonly repositories: LocalRepositories;
      readonly status: 'ready';
    }
  | { readonly status: 'error' };

function AppContent() {
  const [initializationKey, setInitializationKey] = useState(0);
  const [legalVisible, setLegalVisible] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({ status: 'loading' });
  const [route, setRoute] = useState<Route>({ name: 'list' });

  useEffect(() => {
    let active = true;

    getLocalRepositories()
      .then((repositories) => {
        if (active) {
          const capture = new ReceiptCaptureCoordinator({
            ingestor: new AttachmentIngestor({
              documents: repositories.documents,
              hasher: new ExpoAttachmentHasher(),
              inspector: new PdfLibAttachmentInspector(),
              storage: new LocalAttachmentStorage(),
            }),
            receipts: repositories.receipts,
          });
          setRepositoryState({ capture, repositories, status: 'ready' });
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

  const screenTitle =
    route.name === 'new'
      ? 'New expense'
      : route.name === 'edit'
        ? 'Edit expense'
        : route.name === 'detail'
          ? 'Expense details'
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
            importError={importError}
            importing={importing}
            onCapture={() => importReceipt(selectCameraReceipt)}
            onCreate={() => setRoute({ name: 'new' })}
            onImportImage={() => importReceipt(selectImageReceipt)}
            onImportPdf={() => importReceipt(selectPdfReceipt)}
            onOpen={(receipt) => setRoute({ name: 'detail', receipt })}
            repository={repositoryState.repositories.receipts}
          />
        ) : route.name === 'detail' ? (
          <ExpenseDetailScreen
            onDeleted={() => setRoute({ name: 'list' })}
            onEdit={() => setRoute({ name: 'edit', receipt: route.receipt })}
            receipt={route.receipt}
            documentRepository={repositoryState.repositories.documents}
            repository={repositoryState.repositories.receipts}
          />
        ) : (
          <ExpenseFormScreen
            onSubmit={submit}
            receipt={route.name === 'edit' ? route.receipt : undefined}
          />
        )}
      </View>

      <LegalModal onClose={() => setLegalVisible(false)} visible={legalVisible} />
    </SafeAreaView>
  );
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
