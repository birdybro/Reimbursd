// SPDX-License-Identifier: GPL-3.0-only
import { CircleAlert } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

interface StatusPanelProps {
  readonly actionLabel?: string;
  readonly message: string;
  readonly onAction?: () => void;
  readonly title: string;
}

export function StatusPanel({ actionLabel, message, onAction, title }: StatusPanelProps) {
  return (
    <View accessibilityLiveRegion="polite" style={styles.container}>
      <CircleAlert color={colors.danger} size={36} strokeWidth={1.8} />
      <Text accessibilityRole="header" style={styles.title}>
        {title}
      </Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel === undefined || onAction === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  action: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 46,
    minWidth: 120,
    paddingHorizontal: 18,
  },
  actionText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  message: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 420,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
  title: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 14,
    textAlign: 'center',
  },
});
