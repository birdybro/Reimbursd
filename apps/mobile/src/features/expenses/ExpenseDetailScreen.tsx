// SPDX-License-Identifier: GPL-3.0-only
import { Pencil, ShieldCheck, Trash2 } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';

import type { ReceiptRepository } from '@reimbursd/database';
import { formatMinorUnits, type Receipt } from '@reimbursd/domain';

import { colors } from '../../theme';
import { formatPurchaseDate } from './display';

interface ExpenseDetailScreenProps {
  readonly onDeleted: () => void;
  readonly onEdit: () => void;
  readonly receipt: Receipt;
  readonly repository: ReceiptRepository;
}

export function ExpenseDetailScreen({
  onDeleted,
  onEdit,
  receipt,
  repository,
}: ExpenseDetailScreenProps) {
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const deleteReceipt = async () => {
    setDeleting(true);
    setDeleteError(false);
    try {
      await repository.delete(receipt.id, receipt.version, new Date().toISOString());
      setConfirmationVisible(false);
      onDeleted();
    } catch {
      setConfirmationVisible(false);
      setDeleteError(true);
      setDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={styles.merchant}>
            {receipt.merchantName}
          </Text>
          <Text style={styles.date}>{formatPurchaseDate(receipt.purchasedAt)}</Text>
        </View>
        <Text style={styles.total}>
          {formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
        </Text>
      </View>

      <View accessibilityLabel="Locally entered manual expense" style={styles.provenance}>
        <ShieldCheck color={colors.green} size={20} strokeWidth={2} />
        <View style={styles.provenanceCopy}>
          <Text style={styles.provenanceTitle}>Manual entry</Text>
          <Text style={styles.provenanceDetail}>Saved and processed locally</Text>
        </View>
      </View>

      <View style={styles.amounts}>
        <AmountRow
          label="Subtotal"
          value={formatMinorUnits(receipt.subtotalMinor, receipt.currencyCode)}
        />
        <AmountRow label="Tax" value={formatMinorUnits(receipt.taxMinor, receipt.currencyCode)} />
        <AmountRow label="Tip" value={formatMinorUnits(receipt.tipMinor, receipt.currencyCode)} />
        <AmountRow
          label="Discount"
          value={formatMinorUnits(receipt.discountMinor, receipt.currencyCode)}
        />
        <View style={styles.totalDivider} />
        <AmountRow
          label={`Total (${receipt.currencyCode})`}
          strong
          value={formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
        />
      </View>

      {receipt.notes.length === 0 ? null : (
        <View style={styles.notesSection}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.notes}>{receipt.notes}</Text>
        </View>
      )}

      {deleteError ? (
        <Text accessibilityLiveRegion="assertive" style={styles.deleteError}>
          The expense could not be deleted. Reload it and try again.
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Pressable
          accessibilityLabel="Edit expense"
          accessibilityRole="button"
          onPress={onEdit}
          style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
        >
          <Pencil color={colors.paper} size={19} strokeWidth={2.3} />
          <Text style={styles.editText}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityLabel="Delete expense"
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          onPress={() => setConfirmationVisible(true)}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Trash2 color={colors.danger} size={19} strokeWidth={2.3} />
          <Text style={styles.deleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmationVisible(false)}
        transparent
        visible={confirmationVisible}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalPanel}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Delete expense?
            </Text>
            <Text style={styles.modalCopy}>
              This removes the expense from your active local records.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityLabel="Cancel expense deletion"
                accessibilityRole="button"
                disabled={deleting}
                onPress={() => setConfirmationVisible(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Confirm expense deletion"
                accessibilityRole="button"
                accessibilityState={{ disabled: deleting }}
                disabled={deleting}
                onPress={deleteReceipt}
                style={({ pressed }) => [styles.modalDelete, pressed && styles.pressed]}
              >
                <Trash2 color={colors.paper} size={18} strokeWidth={2.3} />
                <Text style={styles.modalDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

interface AmountRowProps {
  readonly label: string;
  readonly strong?: boolean;
  readonly value: string;
}

function AmountRow({ label, strong = false, value }: AmountRowProps) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  amountLabel: {
    color: colors.muted,
    fontSize: 15,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  amounts: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  amountValue: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  content: {
    alignSelf: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 14,
    width: '100%',
    maxWidth: 720,
  },
  date: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 5,
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
    padding: 12,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  editText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  merchant: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCancel: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalCancelText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  modalCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  modalDelete: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalDeleteText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  modalPanel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(23, 34, 29, 0.18)',
    elevation: 8,
    maxWidth: 420,
    padding: 22,
    width: '100%',
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  notes: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  notesSection: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 18,
    paddingTop: 22,
  },
  pressed: {
    opacity: 0.65,
  },
  provenance: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: 22,
    minHeight: 66,
  },
  provenanceCopy: {
    marginLeft: 11,
  },
  provenanceDetail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  provenanceTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  strong: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  total: {
    color: colors.green,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  totalDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});
