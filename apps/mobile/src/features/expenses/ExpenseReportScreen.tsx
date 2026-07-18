// SPDX-License-Identifier: GPL-3.0-only
import { ChartColumn } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import type {
  CategoryExpenseTotal,
  ExpenseReportRepository,
  ExpenseTotals,
} from '@reimbursd/database';
import {
  formatMinorUnits,
  supportedCurrencyCodes,
  type SupportedCurrencyCode,
} from '@reimbursd/domain';

import { StatusPanel } from '../../components/StatusPanel';
import { colors } from '../../theme';

interface ExpenseReportScreenProps {
  readonly repository: ExpenseReportRepository;
}

type ReportState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly totals: ExpenseTotals };

export function ExpenseReportScreen({ repository }: ExpenseReportScreenProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState<ReportState>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    repository
      .getTotals()
      .then((totals) => {
        if (active) {
          setState({ status: 'ready', totals });
        }
      })
      .catch(() => {
        if (active) {
          setState({ status: 'error' });
        }
      });

    return () => {
      active = false;
    };
  }, [refreshKey, repository]);

  if (state.status === 'loading') {
    return (
      <View accessibilityLabel="Loading expense totals" style={styles.centerState}>
        <ActivityIndicator color={colors.green} size="large" />
      </View>
    );
  }

  if (state.status === 'error') {
    return (
      <StatusPanel
        actionLabel="Try again"
        message="Your local expenses are unchanged. Try calculating the totals again."
        onAction={() => {
          setState({ status: 'loading' });
          setRefreshKey((value) => value + 1);
        }}
        title="Could not load totals"
      />
    );
  }

  if (state.totals.monthlyTotals.length === 0) {
    return (
      <View style={styles.centerState}>
        <View style={styles.emptyMark}>
          <ChartColumn color={colors.green} size={42} strokeWidth={1.8} />
        </View>
        <Text accessibilityRole="header" style={styles.emptyTitle}>
          No totals yet
        </Text>
        <Text style={styles.emptyCopy}>Saved expenses will appear in local reports.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.contentInner}>
        <ReportSection title="Monthly totals">
          {state.totals.monthlyTotals.map((total) => (
            <TotalRow
              accessibilityLabel={`${formatMonth(total.month)}, ${formatReceiptCount(total.receiptCount)}, ${formatMinorUnits(total.totalMinor, total.currencyCode)}`}
              currencyCode={total.currencyCode}
              key={`${total.month}-${total.currencyCode}`}
              label={formatMonth(total.month)}
              receiptCount={total.receiptCount}
              totalMinor={total.totalMinor}
            />
          ))}
        </ReportSection>

        <ReportSection title="Category totals">
          {supportedCurrencyCodes.map((currencyCode) => {
            const totals = state.totals.categoryTotals.filter(
              (total) => total.currencyCode === currencyCode,
            );

            return totals.length === 0 ? null : (
              <CategoryCurrencyGroup
                currencyCode={currencyCode}
                key={currencyCode}
                totals={totals}
              />
            );
          })}
        </ReportSection>
      </View>
    </ScrollView>
  );
}

function ReportSection({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          {title}
        </Text>
      </View>
      {children}
    </View>
  );
}

function CategoryCurrencyGroup({
  currencyCode,
  totals,
}: {
  readonly currencyCode: SupportedCurrencyCode;
  readonly totals: readonly CategoryExpenseTotal[];
}) {
  return (
    <View>
      <Text accessibilityRole="header" style={styles.currencyHeader}>
        {currencyCode}
      </Text>
      {totals.map((total) => {
        const label = total.category?.name ?? 'Uncategorized';
        return (
          <TotalRow
            accessibilityLabel={`${label}, ${formatReceiptCount(total.receiptCount)}, ${formatMinorUnits(total.totalMinor, total.currencyCode)}`}
            currencyCode={total.currencyCode}
            key={total.category?.id ?? `uncategorized-${currencyCode}`}
            label={label}
            receiptCount={total.receiptCount}
            totalMinor={total.totalMinor}
          />
        );
      })}
    </View>
  );
}

function TotalRow({
  accessibilityLabel,
  currencyCode,
  label,
  receiptCount,
  totalMinor,
}: {
  readonly accessibilityLabel: string;
  readonly currencyCode: SupportedCurrencyCode;
  readonly label: string;
  readonly receiptCount: number;
  readonly totalMinor: number;
}) {
  return (
    <View accessibilityLabel={accessibilityLabel} style={styles.totalRow}>
      <View style={styles.totalCopy}>
        <Text numberOfLines={1} style={styles.totalLabel}>
          {label}
        </Text>
        <Text style={styles.receiptCount}>{formatReceiptCount(receiptCount)}</Text>
      </View>
      <View style={styles.amountBlock}>
        <Text style={styles.amount}>{formatMinorUnits(totalMinor, currencyCode)}</Text>
        <Text style={styles.currencyCode}>{currencyCode}</Text>
      </View>
    </View>
  );
}

function formatMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    timeZone: 'UTC',
    year: 'numeric',
  }).format(new Date(Date.UTC(year ?? 0, (monthNumber ?? 1) - 1, 1)));
}

function formatReceiptCount(count: number): string {
  return `${count} ${count === 1 ? 'expense' : 'expenses'}`;
}

const styles = StyleSheet.create({
  amount: { color: colors.ink, fontSize: 16, fontWeight: '700', textAlign: 'right' },
  amountBlock: { marginLeft: 14 },
  centerState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 280,
    padding: 28,
  },
  content: { paddingBottom: 28 },
  contentInner: { alignSelf: 'center', maxWidth: 760, width: '100%' },
  currencyCode: { color: colors.muted, fontSize: 11, marginTop: 4, textAlign: 'right' },
  currencyHeader: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 20,
    paddingVertical: 9,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyMark: {
    alignItems: 'center',
    backgroundColor: colors.softGreen,
    borderRadius: 8,
    height: 78,
    justifyContent: 'center',
    width: 78,
  },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '700', marginTop: 16 },
  receiptCount: { color: colors.muted, fontSize: 13, marginTop: 5 },
  section: {
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    marginTop: 18,
  },
  sectionHeader: {
    backgroundColor: colors.background,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 15,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: '700' },
  totalCopy: { flex: 1, minWidth: 0 },
  totalLabel: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  totalRow: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 70,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
});
