// SPDX-License-Identifier: GPL-3.0-only
import { Archive, FileSpreadsheet, Trash2, Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { colors } from '../../theme';

interface ExpenseExportModalProps {
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onDeleteAllData: () => void;
  readonly onExportArchive: (includeOriginalAttachments: boolean) => void;
  readonly onExportCsv: () => void;
  readonly onRestoreArchive: () => void;
  readonly status: 'error' | 'exporting' | 'idle';
}

export function ExpenseExportModal({
  errorMessage,
  onClose,
  onDeleteAllData,
  onExportArchive,
  onExportCsv,
  onRestoreArchive,
  status,
}: ExpenseExportModalProps) {
  const [includeOriginalAttachments, setIncludeOriginalAttachments] = useState(true);
  const disabled = status === 'exporting';

  return (
    <Modal animationType="fade" onRequestClose={disabled ? undefined : onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Manage local data
            </Text>
            <Pressable
              accessibilityLabel="Close local data management"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <X color={colors.ink} size={21} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.optionRow}>
              <Text style={styles.optionLabel}>Include original receipt files</Text>
              <Switch
                accessibilityLabel="Include original receipt files"
                accessibilityRole="switch"
                disabled={disabled}
                onValueChange={setIncludeOriginalAttachments}
                thumbColor={colors.paper}
                trackColor={{ false: colors.border, true: colors.green }}
                value={includeOriginalAttachments}
              />
            </View>

            {status === 'error' && errorMessage !== null ? (
              <Text accessibilityLiveRegion="assertive" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel="Export complete data archive"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={() => onExportArchive(includeOriginalAttachments)}
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && styles.disabled,
                pressed && styles.primaryPressed,
              ]}
            >
              <Archive color={colors.paper} size={19} strokeWidth={2.2} />
              <Text style={styles.primaryText}>{disabled ? 'Working...' : 'Complete archive'}</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="Export expenses as CSV"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onExportCsv}
              style={({ pressed }) => [
                styles.secondaryButton,
                disabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <FileSpreadsheet color={colors.green} size={19} strokeWidth={2.2} />
              <Text style={styles.secondaryText}>Expense CSV</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              accessibilityLabel="Restore complete data archive"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onRestoreArchive}
              style={({ pressed }) => [
                styles.secondaryButton,
                disabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Upload color={colors.green} size={19} strokeWidth={2.2} />
              <Text style={styles.secondaryText}>Restore archive</Text>
            </Pressable>

            <View style={styles.divider} />

            <Pressable
              accessibilityLabel="Delete all local data"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onDeleteAllData}
              style={({ pressed }) => [
                styles.dangerButton,
                disabled && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Trash2 color={colors.danger} size={19} strokeWidth={2.2} />
              <Text style={styles.dangerText}>Delete all local data</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.46)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: { gap: 14, padding: 20 },
  disabled: { opacity: 0.55 },
  dangerButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 16,
  },
  dangerText: { color: colors.danger, fontSize: 15, fontWeight: '700' },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: 2,
  },
  error: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    padding: 10,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 60,
    paddingHorizontal: 20,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  optionLabel: { color: colors.ink, flex: 1, fontSize: 15, fontWeight: '600' },
  optionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
    minHeight: 48,
  },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    maxWidth: 460,
    overflow: 'hidden',
    width: '100%',
  },
  pressed: { opacity: 0.62 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 48,
  },
  primaryPressed: { backgroundColor: '#11543c' },
  primaryText: { color: colors.paper, fontSize: 14, fontWeight: '700' },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.green,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 48,
  },
  secondaryText: { color: colors.green, fontSize: 14, fontWeight: '700' },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
});
