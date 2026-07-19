// SPDX-License-Identifier: GPL-3.0-only
import { Upload, X } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../theme';

interface EncryptedRestoreModalProps {
  readonly errorMessage: string | null;
  readonly onClose: () => void;
  readonly onRestore: (recoveryKey: string) => void;
  readonly status: 'error' | 'exporting' | 'idle';
}

export function EncryptedRestoreModal({
  errorMessage,
  onClose,
  onRestore,
  status,
}: EncryptedRestoreModalProps) {
  const [recoveryKey, setRecoveryKey] = useState('');
  const disabled = status === 'exporting';
  const keyMissing = recoveryKey.trim().length === 0;

  return (
    <Modal animationType="fade" onRequestClose={disabled ? undefined : onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Restore encrypted backup
            </Text>
            <Pressable
              accessibilityLabel="Cancel encrypted restore"
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
            <TextInput
              accessibilityLabel="Backup recovery key"
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!disabled}
              multiline
              onChangeText={setRecoveryKey}
              placeholder="RBK1-..."
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={recoveryKey}
            />

            {status === 'error' && errorMessage !== null ? (
              <Text accessibilityLiveRegion="assertive" style={styles.error}>
                {errorMessage}
              </Text>
            ) : null}

            <Pressable
              accessibilityLabel="Choose encrypted backup to restore"
              accessibilityRole="button"
              accessibilityState={{ disabled: disabled || keyMissing }}
              disabled={disabled || keyMissing}
              onPress={() => onRestore(recoveryKey)}
              style={({ pressed }) => [
                styles.primaryButton,
                (disabled || keyMissing) && styles.disabled,
                pressed && styles.primaryPressed,
              ]}
            >
              <Upload color={colors.paper} size={19} strokeWidth={2.2} />
              <Text style={styles.primaryText}>{disabled ? 'Restoring...' : 'Choose backup'}</Text>
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
  input: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 22,
    minHeight: 92,
    padding: 12,
    textAlignVertical: 'top',
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
});
