// SPDX-License-Identifier: GPL-3.0-only
import { Info, LockKeyhole, ReceiptText, ShieldCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

const colors = {
  background: '#f4f7f5',
  border: '#cbd5cf',
  coral: '#c94e38',
  green: '#176b4d',
  ink: '#17221d',
  muted: '#5d6963',
  paper: '#ffffff',
  softGreen: '#dce9e1',
} as const;

function AppContent() {
  const [legalVisible, setLegalVisible] = useState(false);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <View>
          <Text accessibilityRole="header" style={styles.brand}>
            Reimbursd
          </Text>
          <Text style={styles.tagline}>Scan it. Verify it. Own your data.</Text>
        </View>
        <Pressable
          accessibilityLabel="Open legal information"
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => setLegalVisible(true)}
          style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
        >
          <Info color={colors.ink} size={22} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View accessibilityLabel="Local mode, no account required" style={styles.localBand}>
          <ShieldCheck color={colors.green} size={24} strokeWidth={2} />
          <View style={styles.localBandCopy}>
            <Text style={styles.localTitle}>Local mode</Text>
            <Text style={styles.localDetail}>No account required</Text>
          </View>
          <LockKeyhole color={colors.coral} size={20} strokeWidth={2} />
        </View>

        <View style={styles.sectionHeader}>
          <Text accessibilityRole="header" style={styles.heading}>
            Expenses
          </Text>
          <Text style={styles.count}>0 records</Text>
        </View>

        <View style={styles.emptyState}>
          <View style={styles.receiptMark}>
            <ReceiptText color={colors.green} size={48} strokeWidth={1.8} />
          </View>
          <Text accessibilityRole="header" style={styles.emptyTitle}>
            No expenses yet
          </Text>
          <Text style={styles.emptyCopy}>Your locally saved expenses will appear here.</Text>
        </View>
      </ScrollView>

      <Modal
        animationType="fade"
        onRequestClose={() => setLegalVisible(false)}
        transparent
        visible={legalVisible}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalPanel}>
            <View style={styles.modalHeader}>
              <Text accessibilityRole="header" style={styles.modalTitle}>
                About Reimbursd
              </Text>
              <Pressable
                accessibilityLabel="Close legal information"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => setLegalVisible(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <X color={colors.ink} size={22} strokeWidth={2} />
              </Pressable>
            </View>
            <Text style={styles.legalProduct}>Reimbursd 0.1.0</Text>
            <Text style={styles.legalCopy}>
              Free software licensed under GPL-3.0-only. Source and license information are included
              with the project repository.
            </Text>
            <View style={styles.divider} />
            <Text style={styles.legalLabel}>Current data behavior</Text>
            <Text style={styles.legalCopy}>
              This foundation build has no account, analytics, location access, external AI, or
              receipt storage.
            </Text>
          </View>
        </View>
      </Modal>
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
  brand: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '700',
  },
  content: {
    flexGrow: 1,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  count: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
  },
  emptyCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 7,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    minHeight: 360,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 18,
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 16,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  heading: {
    color: colors.ink,
    fontSize: 21,
    fontWeight: '700',
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  legalCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  legalLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  legalProduct: {
    color: colors.green,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  localBand: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 68,
    paddingHorizontal: 4,
  },
  localBandCopy: {
    flex: 1,
    marginLeft: 12,
  },
  localDetail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 2,
  },
  localTitle: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalPanel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(23, 34, 29, 0.18)',
    elevation: 8,
    maxWidth: 480,
    padding: 22,
    width: '100%',
  },
  modalTitle: {
    color: colors.ink,
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.56,
  },
  receiptMark: {
    alignItems: 'center',
    backgroundColor: colors.softGreen,
    borderRadius: 8,
    height: 88,
    justifyContent: 'center',
    width: 88,
  },
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 28,
  },
  tagline: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
});
