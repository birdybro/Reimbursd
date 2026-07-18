// SPDX-License-Identifier: GPL-3.0-only
import { Trash2, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme';

interface DeleteAllDataModalProps {
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly status: 'deleting' | 'error' | 'idle';
}

export function DeleteAllDataModal({
  errorMessage,
  onClose,
  onConfirm,
  status,
}: DeleteAllDataModalProps) {
  const disabled = status === 'deleting';

  return (
    <Modal animationType="fade" onRequestClose={disabled ? undefined : onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Delete all local data?
            </Text>
            <Pressable
              accessibilityLabel="Close local data deletion"
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
            <Text style={styles.message}>
              This permanently removes every expense, category, tag, processing record, and receipt
              file from this installation. Export a complete archive first if you need a copy.
            </Text>

            {status === 'error' && errorMessage !== null ? (
              <Text accessibilityLiveRegion="assertive" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <Pressable
                accessibilityLabel="Cancel local data deletion"
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={onClose}
                style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Confirm delete all local data"
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={onConfirm}
                style={({ pressed }) => [
                  styles.deleteButton,
                  disabled && styles.disabled,
                  pressed && styles.deletePressed,
                ]}
              >
                <Trash2 color={colors.paper} size={19} strokeWidth={2.2} />
                <Text style={styles.deleteText}>{disabled ? 'Deleting...' : 'Delete all'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.46)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  cancelButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
  },
  cancelText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  content: { gap: 18, padding: 20 },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 18,
  },
  deletePressed: { opacity: 0.78 },
  deleteText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  disabled: { opacity: 0.55 },
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
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  message: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    maxWidth: 480,
    overflow: 'hidden',
    width: '100%',
  },
  pressed: { opacity: 0.62 },
  title: { color: colors.ink, flex: 1, fontSize: 18, fontWeight: '700' },
});
