// SPDX-License-Identifier: GPL-3.0-only
import { X } from 'lucide-react-native';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

interface LegalModalProps {
  readonly onClose: () => void;
  readonly visible: boolean;
}

export function LegalModal({ onClose, visible }: LegalModalProps) {
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              About Reimbursd
            </Text>
            <Pressable
              accessibilityLabel="Close legal information"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <X color={colors.ink} size={22} strokeWidth={2} />
            </Pressable>
          </View>
          <Text style={styles.product}>Reimbursd 0.1.0</Text>
          <Text style={styles.copy}>
            Free software licensed under GPL-3.0-only. Source and license information are included
            with the project repository.
          </Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Current data behavior</Text>
          <Text style={styles.copy}>
            Manual expenses are stored in the private local application database. This build has no
            account, analytics, location access, external AI, or synchronization.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  copy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 23,
  },
  divider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
    marginVertical: 20,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(23, 34, 29, 0.18)',
    elevation: 8,
    maxWidth: 480,
    padding: 22,
    width: '100%',
  },
  pressed: {
    opacity: 0.56,
  },
  product: {
    color: colors.green,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10,
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
});
