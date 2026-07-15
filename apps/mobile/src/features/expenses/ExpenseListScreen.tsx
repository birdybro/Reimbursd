// SPDX-License-Identifier: GPL-3.0-only
import { Filter, Plus, ReceiptText, Search, ShieldCheck } from 'lucide-react-native';
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

import type { ReceiptRepository } from '@reimbursd/database';
import { formatMinorUnits, type Receipt, type SupportedCurrencyCode } from '@reimbursd/domain';

import { CurrencyPickerModal } from '../../components/CurrencyPickerModal';
import { StatusPanel } from '../../components/StatusPanel';
import { colors } from '../../theme';
import { formatPurchaseDate } from './display';

interface ExpenseListScreenProps {
  readonly onCreate: () => void;
  readonly onOpen: (receipt: Receipt) => void;
  readonly repository: ReceiptRepository;
}

export function ExpenseListScreen({ onCreate, onOpen, repository }: ExpenseListScreenProps) {
  const [currencyCode, setCurrencyCode] = useState<SupportedCurrencyCode | null>(null);
  const [error, setError] = useState(false);
  const [filterVisible, setFilterVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<readonly Receipt[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;

    repository
      .list({ currencyCode, search })
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
  }, [currencyCode, refreshKey, repository, search]);

  const filtering = search.trim().length > 0 || currencyCode !== null;

  return (
    <View style={styles.screen}>
      <View style={styles.localBand} accessibilityLabel="Local mode, no account required">
        <ShieldCheck color={colors.green} size={22} strokeWidth={2} />
        <Text style={styles.localText}>Local mode</Text>
        <Text style={styles.localDetail}>No account required</Text>
      </View>

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
          accessibilityLabel={`Filter currency, ${currencyCode ?? 'all currencies'}`}
          accessibilityRole="button"
          onPress={() => setFilterVisible(true)}
          style={({ pressed }) => [
            styles.filterButton,
            currencyCode !== null && styles.filterButtonActive,
            pressed && styles.pressed,
          ]}
        >
          <Filter
            color={currencyCode === null ? colors.ink : colors.green}
            size={19}
            strokeWidth={2}
          />
          <Text style={[styles.filterText, currencyCode !== null && styles.filterTextActive]}>
            {currencyCode ?? 'All'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.heading}>
          Expenses
        </Text>
        <Text style={styles.count}>
          {receipts.length} {receipts.length === 1 ? 'record' : 'records'}
        </Text>
      </View>

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
              ? 'Adjust the search or currency filter.'
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
        <Pressable
          accessibilityLabel="Create manual expense"
          accessibilityRole="button"
          onPress={onCreate}
          style={({ pressed }) => [styles.primaryAction, pressed && styles.primaryPressed]}
        >
          <Plus color={colors.paper} size={21} strokeWidth={2.4} />
          <Text style={styles.primaryActionText}>Manual expense</Text>
        </Pressable>
      </View>

      <CurrencyPickerModal
        allowAll
        onClose={() => setFilterVisible(false)}
        onSelect={setCurrencyCode}
        value={currencyCode}
        visible={filterVisible}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  actionArea: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 16,
  },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 220,
    padding: 24,
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
  primaryAction: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    maxWidth: 720,
    minHeight: 50,
    width: '100%',
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
  toolbar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 18,
  },
});
