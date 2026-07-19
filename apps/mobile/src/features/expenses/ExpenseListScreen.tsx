// SPDX-License-Identifier: GPL-3.0-only
import {
  ChartColumn,
  Camera,
  Download,
  FileImage,
  FileText,
  Filter,
  Plus,
  RefreshCw,
  ReceiptText,
  Search,
  ShieldCheck,
} from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type {
  CategoryRepository,
  ReceiptListOptions,
  ReceiptRepository,
  TagRepository,
} from '@reimbursd/database';
import { formatMinorUnits, type Receipt } from '@reimbursd/domain';

import { StatusPanel } from '../../components/StatusPanel';
import { colors } from '../../theme';
import { formatPurchaseDate } from './display';
import { ExpenseExportModal } from './ExpenseExportModal';
import { EncryptedBackupModal } from './EncryptedBackupModal';
import { EncryptedRestoreModal } from './EncryptedRestoreModal';
import { DeleteAllDataModal } from './DeleteAllDataModal';
import { ExpenseFilterModal } from './ExpenseFilterModal';
import {
  countActiveExpenseFilters,
  emptyExpenseFilters,
  type ExpenseFilterValues,
} from './expense-filter';
import { getStructuredRestoreErrorMessage } from './structured-restore';
import type { PreparedEncryptedBackup } from './encrypted-backup';

export interface EncryptedRestoreActionResult {
  readonly recoveryKeyStored: boolean | null;
}

interface ExpenseListScreenProps {
  readonly categoryRepository: CategoryRepository;
  readonly cleanupIssue: string | null;
  readonly importError: string | null;
  readonly importing: boolean;
  readonly onCapture: () => void;
  readonly onCreate: () => void;
  readonly onDeleteAllData: () => Promise<void>;
  readonly onExportEncryptedBackup?: (prepared: PreparedEncryptedBackup) => Promise<void>;
  readonly onExportArchive: (includeOriginalAttachments: boolean) => Promise<void>;
  readonly onExportCsv: () => Promise<void>;
  readonly onImportImage: () => void;
  readonly onImportPdf: () => void;
  readonly onOpen: (receipt: Receipt) => void;
  readonly onOpenReports: () => void;
  readonly onPrepareEncryptedBackup?: () => Promise<PreparedEncryptedBackup>;
  readonly onRestoreEncryptedBackup?: (
    recoveryKey: string,
  ) => Promise<EncryptedRestoreActionResult | false>;
  readonly onRestoreArchive: () => Promise<boolean>;
  readonly onRetryCleanup: () => void;
  readonly repository: ReceiptRepository;
  readonly retryingCleanup: boolean;
  readonly tagRepository: TagRepository;
}

export function ExpenseListScreen({
  categoryRepository,
  cleanupIssue,
  importError,
  importing,
  onCapture,
  onCreate,
  onDeleteAllData,
  onExportEncryptedBackup,
  onExportArchive,
  onExportCsv,
  onImportImage,
  onImportPdf,
  onOpen,
  onOpenReports,
  onPrepareEncryptedBackup,
  onRestoreEncryptedBackup,
  onRestoreArchive,
  onRetryCleanup,
  repository,
  retryingCleanup,
  tagRepository,
}: ExpenseListScreenProps) {
  const [error, setError] = useState(false);
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null);
  const [deleteAllStatus, setDeleteAllStatus] = useState<'deleting' | 'error' | 'idle'>('idle');
  const [deleteAllVisible, setDeleteAllVisible] = useState(false);
  const [encryptedBackupVisible, setEncryptedBackupVisible] = useState(false);
  const [encryptedRestoreVisible, setEncryptedRestoreVisible] = useState(false);
  const [exportStatus, setExportStatus] = useState<'error' | 'exporting' | 'idle' | 'success'>(
    'idle',
  );
  const [exportErrorMessage, setExportErrorMessage] = useState<string | null>(null);
  const [exportKind, setExportKind] = useState<'archive' | 'backup' | 'csv' | 'delete' | 'restore'>(
    'csv',
  );
  const [exportVisible, setExportVisible] = useState(false);
  const [filterOptions, setFilterOptions] = useState<ReceiptListOptions>({});
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterValues, setFilterValues] = useState<ExpenseFilterValues>(emptyExpenseFilters);
  const [loading, setLoading] = useState(true);
  const [preparedEncryptedBackup, setPreparedEncryptedBackup] =
    useState<PreparedEncryptedBackup | null>(null);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;

    repository
      .list({ ...filterOptions, search })
      .then((results) => {
        if (active) {
          setReceipts(results);
          setError(false);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [filterOptions, refreshKey, repository, search]);

  const activeFilterCount = countActiveExpenseFilters(filterValues);
  const filtering = search.trim().length > 0 || activeFilterCount > 0;

  const exportData = async (
    kind: 'archive' | 'csv' | 'restore',
    action: () => Promise<boolean | void>,
  ): Promise<void> => {
    if (exportStatus === 'exporting') {
      return;
    }

    setExportKind(kind);
    setExportErrorMessage(null);
    setExportStatus('exporting');

    try {
      const completed = await action();

      if (completed === false) {
        setExportStatus('idle');
        setExportVisible(false);
        return;
      }

      setExportStatus('success');
      setExportVisible(false);
      if (kind === 'restore') {
        setRefreshKey((value) => value + 1);
      }
    } catch (error) {
      setExportErrorMessage(
        kind === 'restore'
          ? getStructuredRestoreErrorMessage(error)
          : 'Export could not be created. Check local file access and try again.',
      );
      setExportStatus('error');
    }
  };

  const prepareEncryptedBackup = async (): Promise<void> => {
    if (onPrepareEncryptedBackup === undefined || exportStatus === 'exporting') {
      return;
    }

    setExportKind('backup');
    setExportErrorMessage(null);
    setExportStatus('exporting');

    try {
      const prepared = await onPrepareEncryptedBackup();
      setPreparedEncryptedBackup(prepared);
      setExportStatus('idle');
      setExportVisible(false);
      setEncryptedBackupVisible(true);
    } catch {
      setExportErrorMessage('A backup key could not be prepared securely. Try again.');
      setExportStatus('error');
    }
  };

  const createEncryptedBackup = async (): Promise<void> => {
    if (
      preparedEncryptedBackup === null ||
      onExportEncryptedBackup === undefined ||
      exportStatus === 'exporting'
    ) {
      return;
    }

    setExportErrorMessage(null);
    setExportStatus('exporting');

    try {
      await onExportEncryptedBackup(preparedEncryptedBackup);
      preparedEncryptedBackup.keyRecord.key.fill(0);
      setPreparedEncryptedBackup(null);
      setEncryptedBackupVisible(false);
      setExportStatus('success');
    } catch {
      setExportErrorMessage(
        'Encrypted backup could not be created. Check file access and try again.',
      );
      setExportStatus('error');
    }
  };

  const restoreEncryptedBackup = async (recoveryKey: string): Promise<void> => {
    if (onRestoreEncryptedBackup === undefined || exportStatus === 'exporting') {
      return;
    }

    setExportKind('restore');
    setExportErrorMessage(null);
    setExportStatus('exporting');

    try {
      const result = await onRestoreEncryptedBackup(recoveryKey);

      if (result === false) {
        setEncryptedRestoreVisible(false);
        setExportStatus('idle');
        return;
      }

      setEncryptedRestoreVisible(false);
      setExportErrorMessage(
        result.recoveryKeyStored === false
          ? 'Restore completed, but this device could not retain the recovery key securely. Keep your separate copy.'
          : result.recoveryKeyStored === null
            ? 'Restore completed. This browser does not retain the recovery key; keep your separate copy.'
            : null,
      );
      setExportStatus('success');
      setRefreshKey((value) => value + 1);
    } catch (error) {
      setExportErrorMessage(getStructuredRestoreErrorMessage(error));
      setExportStatus('error');
    }
  };

  const deleteAllData = async (): Promise<void> => {
    if (deleteAllStatus === 'deleting') {
      return;
    }

    setDeleteAllError(null);
    setDeleteAllStatus('deleting');

    try {
      await onDeleteAllData();
      setDeleteAllStatus('idle');
      setDeleteAllVisible(false);
      setExportKind('delete');
      setExportStatus('success');
      setFilterOptions({});
      setFilterValues(emptyExpenseFilters);
      setSearch('');
      setRefreshKey((value) => value + 1);
    } catch {
      setDeleteAllError(
        'Local data deletion could not start. Existing local data remains available; try again.',
      );
      setDeleteAllStatus('error');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.localBand} accessibilityLabel="Local mode, no account required">
        <ShieldCheck color={colors.green} size={22} strokeWidth={2} />
        <Text style={styles.localText}>Local mode</Text>
        <Text style={styles.localDetail}>No account required</Text>
      </View>

      {cleanupIssue === null ? null : (
        <View accessibilityLiveRegion="assertive" style={styles.cleanupBand}>
          <Text style={styles.cleanupText}>{cleanupIssue}</Text>
          <Pressable
            accessibilityLabel="Retry receipt file deletion"
            accessibilityRole="button"
            accessibilityState={{ disabled: retryingCleanup }}
            disabled={retryingCleanup}
            onPress={onRetryCleanup}
            style={({ pressed }) => [styles.cleanupAction, pressed && styles.pressed]}
          >
            <RefreshCw color={colors.danger} size={17} strokeWidth={2.3} />
            <Text style={styles.cleanupActionText}>
              {retryingCleanup ? 'Retrying...' : 'Retry'}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.toolbar}>
        <View style={styles.searchBox}>
          <Search color={colors.muted} size={20} strokeWidth={2} />
          <TextInput
            accessibilityLabel="Search expenses by merchant"
            autoCapitalize="none"
            onChangeText={setSearch}
            placeholder="Search merchants"
            placeholderTextColor={colors.muted}
            returnKeyType="search"
            style={styles.searchInput}
            value={search}
          />
        </View>
        <Pressable
          accessibilityLabel={`Filter expenses, ${activeFilterCount} active`}
          accessibilityRole="button"
          onPress={() => setFilterVisible(true)}
          style={({ pressed }) => [
            styles.filterButton,
            activeFilterCount > 0 && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Filter
            color={activeFilterCount === 0 ? colors.ink : colors.green}
            size={19}
            strokeWidth={2}
          />
          <Text style={[styles.filterText, activeFilterCount > 0 && styles.filterTextActive]}>
            {activeFilterCount === 0 ? 'Filters' : activeFilterCount}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.heading}>
          Expenses
        </Text>
        <View style={styles.sectionActions}>
          <Text style={styles.count}>
            {receipts.length} {receipts.length === 1 ? 'record' : 'records'}
          </Text>
          <Pressable
            accessibilityLabel={exportStatus === 'exporting' ? 'Exporting data' : 'Export data'}
            accessibilityRole="button"
            accessibilityState={{ disabled: exportStatus === 'exporting' }}
            disabled={exportStatus === 'exporting'}
            onPress={() => {
              setExportStatus('idle');
              setExportErrorMessage(null);
              setExportVisible(true);
            }}
            style={({ pressed }) => [
              styles.sectionIconButton,
              exportStatus === 'exporting' && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Download color={colors.green} size={20} strokeWidth={2.2} />
          </Pressable>
          <Pressable
            accessibilityLabel="View expense reports"
            accessibilityRole="button"
            onPress={onOpenReports}
            style={({ pressed }) => [styles.sectionIconButton, pressed && styles.pressed]}
          >
            <ChartColumn color={colors.green} size={20} strokeWidth={2.2} />
          </Pressable>
        </View>
      </View>

      {exportStatus === 'success' ? (
        <Text accessibilityLiveRegion="polite" style={styles.exportSuccess}>
          {exportKind === 'archive'
            ? 'Complete export is ready.'
            : exportKind === 'backup'
              ? 'Encrypted backup is ready.'
              : exportKind === 'restore'
                ? (exportErrorMessage ?? 'Restore completed.')
                : exportKind === 'delete'
                  ? 'All local data was deleted.'
                  : 'CSV export is ready.'}
        </Text>
      ) : exportStatus === 'error' && !exportVisible ? (
        <Text accessibilityLiveRegion="assertive" style={styles.exportError}>
          {exportErrorMessage ?? 'Data operation could not be completed. Try again.'}
        </Text>
      ) : null}

      {loading ? (
        <View accessibilityLabel="Loading expenses" style={styles.centerState}>
          <ActivityIndicator color={colors.green} size="large" />
        </View>
      ) : error ? (
        <StatusPanel
          actionLabel="Try again"
          message="Your local data is still on this device. Try loading the list again."
          onAction={() => {
            setLoading(true);
            setError(false);
            setRefreshKey((value) => value + 1);
          }}
          title="Could not load expenses"
        />
      ) : receipts.length === 0 ? (
        <View style={styles.centerState}>
          <View style={styles.receiptMark}>
            <ReceiptText color={colors.green} size={44} strokeWidth={1.8} />
          </View>
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            {filtering ? 'No matching expenses' : 'No expenses yet'}
          </Text>
          <Text style={styles.emptyCopy}>
            {filtering
              ? 'Adjust the search or filters.'
              : 'Your locally saved expenses will appear here.'}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {receipts.map((receipt) => (
            <Pressable
              accessibilityLabel={`${receipt.merchantName}, ${formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}`}
              accessibilityRole="button"
              key={receipt.id}
              onPress={() => onOpen(receipt)}
              style={({ pressed }) => [styles.receiptRow, pressed && styles.rowPressed]}
            >
              <View style={styles.receiptCopy}>
                <Text numberOfLines={1} style={styles.merchantName}>
                  {receipt.merchantName}
                </Text>
                <Text style={styles.receiptDate}>{formatPurchaseDate(receipt.purchasedAt)}</Text>
              </View>
              <View style={styles.receiptAmountBlock}>
                <Text style={styles.receiptAmount}>
                  {formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
                </Text>
                <Text style={styles.receiptCurrency}>{receipt.currencyCode}</Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={styles.actionArea}>
        {importError === null ? null : (
          <Text accessibilityLiveRegion="assertive" style={styles.importError}>
            {importError}
          </Text>
        )}
        <View style={styles.importActions}>
          <ImportButton
            disabled={importing}
            icon={<Camera color={colors.paper} size={20} strokeWidth={2.3} />}
            label="Scan"
            onPress={onCapture}
            primary
          />
          <ImportButton
            disabled={importing}
            icon={<FileImage color={colors.ink} size={20} strokeWidth={2.1} />}
            label="Image"
            onPress={onImportImage}
          />
          <ImportButton
            disabled={importing}
            icon={<FileText color={colors.ink} size={20} strokeWidth={2.1} />}
            label="PDF"
            onPress={onImportPdf}
          />
        </View>
        <Pressable
          accessibilityLabel="Create manual expense"
          accessibilityRole="button"
          accessibilityState={{ disabled: importing }}
          disabled={importing}
          onPress={onCreate}
          style={({ pressed }) => [styles.manualAction, pressed && styles.pressed]}
        >
          <Plus color={colors.green} size={19} strokeWidth={2.3} />
          <Text style={styles.manualActionText}>Manual expense</Text>
        </Pressable>
      </View>

      {filterVisible ? (
        <ExpenseFilterModal
          categories={categoryRepository}
          initialValues={filterValues}
          onApply={(values, options) => {
            setFilterValues(values);
            setFilterOptions(options);
            setFilterVisible(false);
          }}
          onClose={() => setFilterVisible(false)}
          tags={tagRepository}
        />
      ) : null}
      {exportVisible ? (
        <ExpenseExportModal
          errorMessage={exportErrorMessage}
          onClose={() => setExportVisible(false)}
          onDeleteAllData={() => {
            setExportVisible(false);
            setDeleteAllError(null);
            setDeleteAllStatus('idle');
            setDeleteAllVisible(true);
          }}
          {...(onPrepareEncryptedBackup === undefined || onExportEncryptedBackup === undefined
            ? {}
            : { onEncryptedBackup: () => void prepareEncryptedBackup() })}
          {...(onRestoreEncryptedBackup === undefined
            ? {}
            : {
                onEncryptedRestore: () => {
                  setExportStatus('idle');
                  setExportErrorMessage(null);
                  setExportVisible(false);
                  setEncryptedRestoreVisible(true);
                },
              })}
          onExportArchive={(includeOriginalAttachments) =>
            void exportData('archive', () => onExportArchive(includeOriginalAttachments))
          }
          onExportCsv={() => void exportData('csv', onExportCsv)}
          onRestoreArchive={() => void exportData('restore', onRestoreArchive)}
          status={exportStatus === 'success' ? 'idle' : exportStatus}
        />
      ) : null}
      {encryptedBackupVisible && preparedEncryptedBackup !== null ? (
        <EncryptedBackupModal
          errorMessage={exportErrorMessage}
          onClose={() => {
            preparedEncryptedBackup.keyRecord.key.fill(0);
            setEncryptedBackupVisible(false);
            setPreparedEncryptedBackup(null);
            setExportStatus('idle');
          }}
          onConfirm={() => void createEncryptedBackup()}
          recoveryKey={preparedEncryptedBackup.recoveryKey}
          status={exportStatus === 'success' ? 'idle' : exportStatus}
        />
      ) : null}
      {encryptedRestoreVisible ? (
        <EncryptedRestoreModal
          errorMessage={exportErrorMessage}
          onClose={() => {
            setEncryptedRestoreVisible(false);
            setExportStatus('idle');
          }}
          onRestore={(recoveryKey) => void restoreEncryptedBackup(recoveryKey)}
          status={exportStatus === 'success' ? 'idle' : exportStatus}
        />
      ) : null}
      {deleteAllVisible ? (
        <DeleteAllDataModal
          errorMessage={deleteAllError}
          onClose={() => setDeleteAllVisible(false)}
          onConfirm={() => void deleteAllData()}
          status={deleteAllStatus}
        />
      ) : null}
    </View>
  );
}

interface ImportButtonProps {
  readonly disabled: boolean;
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly onPress: () => void;
  readonly primary?: boolean;
}

function ImportButton({ disabled, icon, label, onPress, primary = false }: ImportButtonProps) {
  return (
    <Pressable
      accessibilityLabel={
        label === 'Scan'
          ? 'Scan receipt with camera'
          : label === 'Image'
            ? 'Import receipt image'
            : 'Import receipt PDF'
      }
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.importButton,
        primary && styles.primaryImportButton,
        pressed && (primary ? styles.primaryPressed : styles.pressed),
      ]}
    >
      {icon}
      <Text style={[styles.importButtonText, primary && styles.primaryActionText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 16,
  },
  importActions: {
    alignSelf: 'center',
    flexDirection: 'row',
    gap: 8,
    maxWidth: 720,
    width: '100%',
  },
  importButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 50,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  importButtonText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  importError: {
    alignSelf: 'center',
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    maxWidth: 720,
    padding: 10,
    width: '100%',
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
    padding: 24,
  },
  cleanupAction: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 90,
    paddingHorizontal: 10,
  },
  cleanupActionText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '700',
  },
  cleanupBand: {
    alignItems: 'center',
    backgroundColor: colors.dangerSoft,
    borderBottomColor: colors.danger,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  cleanupText: {
    color: colors.danger,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  count: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 16,
  },
  exportError: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  exportSuccess: {
    backgroundColor: colors.softGreen,
    color: colors.green,
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  filterButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    height: 48,
    justifyContent: 'center',
    paddingHorizontal: 13,
  },
  filterButtonActive: {
    backgroundColor: colors.softGreen,
    borderColor: colors.green,
  },
  filterText: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  filterTextActive: {
    color: colors.green,
  },
  heading: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '700',
  },
  list: {
    gap: 10,
    paddingBottom: 18,
    paddingHorizontal: 20,
  },
  localBand: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 20,
  },
  localDetail: {
    color: colors.muted,
    fontSize: 13,
  },
  localText: {
    color: colors.ink,
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 10,
  },
  merchantName: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.62,
  },
  manualAction: {
    alignItems: 'center',
    alignSelf: 'center',
    borderColor: colors.green,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    maxWidth: 720,
    minHeight: 46,
    width: '100%',
  },
  manualActionText: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  primaryImportButton: {
    backgroundColor: colors.green,
    borderColor: colors.green,
  },
  primaryActionText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  primaryPressed: {
    backgroundColor: '#11543c',
  },
  receiptAmount: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'right',
  },
  receiptAmountBlock: {
    marginLeft: 12,
  },
  receiptCopy: {
    flex: 1,
    minWidth: 0,
  },
  receiptCurrency: {
    color: colors.muted,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'right',
  },
  receiptDate: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 5,
  },
  receiptMark: {
    alignItems: 'center',
    backgroundColor: colors.softGreen,
    borderRadius: 8,
    height: 80,
    justifyContent: 'center',
    width: 80,
  },
  receiptRow: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowPressed: {
    backgroundColor: colors.softGreen,
    borderColor: colors.green,
  },
  screen: {
    flex: 1,
  },
  sectionIconButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  disabled: { opacity: 0.55 },
  searchBox: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 48,
    minWidth: 0,
    paddingHorizontal: 13,
  },
  searchInput: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
    height: 46,
    marginLeft: 9,
    minWidth: 0,
    padding: 0,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  sectionActions: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
});
