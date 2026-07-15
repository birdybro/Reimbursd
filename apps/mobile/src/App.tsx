// SPDX-License-Identifier: GPL-3.0-only
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import type { ReceiptRepository } from '@reimbursd/database';
import type { Receipt } from '@reimbursd/domain';

import { AppHeader } from './components/AppHeader';
import { LegalModal } from './components/LegalModal';
import { StatusPanel } from './components/StatusPanel';
import { ExpenseDetailScreen } from './features/expenses/ExpenseDetailScreen';
import { ExpenseFormScreen } from './features/expenses/ExpenseFormScreen';
import { ExpenseListScreen } from './features/expenses/ExpenseListScreen';
import type { ExpenseFormSubmission } from './features/expenses/expense-form';
import { getLocalReceiptRepository } from './storage/expo-sqlite';
import { colors } from './theme';

type Route =
  | { readonly name: 'list' }
  | { readonly name: 'detail'; readonly receipt: Receipt }
  | { readonly name: 'new' }
  | { readonly name: 'edit'; readonly receipt: Receipt };

type RepositoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly repository: ReceiptRepository }
  | { readonly status: 'error' };

function AppContent() {
  const [initializationKey, setInitializationKey] = useState(0);
  const [legalVisible, setLegalVisible] = useState(false);
  const [repositoryState, setRepositoryState] = useState<RepositoryState>({ status: 'loading' });
  const [route, setRoute] = useState<Route>({ name: 'list' });

  useEffect(() => {
    let active = true;

    getLocalReceiptRepository()
      .then((repository) => {
        if (active) {
          setRepositoryState({ repository, status: 'ready' });
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
        ? await repositoryState.repository.create(submission.receipt)
        : await repositoryState.repository.update(submission.input);
    setRoute({ name: 'detail', receipt });
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
            onCreate={() => setRoute({ name: 'new' })}
            onOpen={(receipt) => setRoute({ name: 'detail', receipt })}
            repository={repositoryState.repository}
          />
        ) : route.name === 'detail' ? (
          <ExpenseDetailScreen
            onDeleted={() => setRoute({ name: 'list' })}
            onEdit={() => setRoute({ name: 'edit', receipt: route.receipt })}
            receipt={route.receipt}
            repository={repositoryState.repository}
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
