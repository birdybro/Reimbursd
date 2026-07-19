// SPDX-License-Identifier: GPL-3.0-only
import { KeyRound, LockKeyhole, X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../theme';

interface EncryptedBackupModalProps {
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
  readonly recoveryKey: string;
  readonly status: 'error' | 'exporting' | 'idle';
}

export function EncryptedBackupModal({
  errorMessage,
  onClose,
  onConfirm,
  recoveryKey,
  status,
}: EncryptedBackupModalProps) {
  const disabled = status === 'exporting';

  return (
    <Modal animationType="fade" onRequestClose={disabled ? undefined : onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <KeyRound color={colors.green} size={21} strokeWidth={2.2} />
              <Text accessibilityRole="header" style={styles.title}>
                Recovery key
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Cancel encrypted backup"
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
            <Text style={styles.warning}>
              Keep this key separately. Losing it after reinstall or device loss can make the backup
              unrecoverable.
            </Text>
            <Text accessibilityLabel="Encrypted backup recovery key" selectable style={styles.key}>
              {recoveryKey}
            </Text>

            {status === 'error' && errorMessage !== null ? (
              <Text accessibilityLiveRegion="assertive" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel="Create encrypted backup"
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              disabled={disabled}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.primaryButton,
                disabled && styles.disabled,
                pressed && styles.primaryPressed,
              ]}
            >
              <LockKeyhole color={colors.paper} size={19} strokeWidth={2.2} />
              <Text style={styles.primaryText}>{disabled ? 'Encrypting...' : 'Create backup'}</Text>
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
  key: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 20,
    padding: 12,
  },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    maxWidth: 500,
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
  title: { color: colors.ink, fontSize: 19, fontWeight: '700' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  warning: { color: colors.ink, fontSize: 14, lineHeight: 21 },
});
