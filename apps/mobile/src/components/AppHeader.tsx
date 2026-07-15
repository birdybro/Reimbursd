// SPDX-License-Identifier: GPL-3.0-only
import { ChevronLeft, Info } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../theme';

interface AppHeaderProps {
  readonly onBack?: (() => void) | undefined;
  readonly onOpenLegal: () => void;
  readonly title?: string | undefined;
}

export function AppHeader({ onBack, onOpenLegal, title }: AppHeaderProps) {
  return (
    <View style={styles.header}>
      {onBack === undefined ? null : (
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onBack}
          style={({ pressed }) => [styles.iconButton, styles.backButton, pressed && styles.pressed]}
        >
          <ChevronLeft color={colors.ink} size={25} strokeWidth={2} />
        </Pressable>
      )}
      <View style={styles.titleBlock}>
        {title === undefined ? (
          <>
            <Text accessibilityRole="header" style={styles.brand}>
              Reimbursd
            </Text>
            <Text numberOfLines={1} style={styles.tagline}>
              Scan it. Verify it. Own your data.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.brand}>Reimbursd</Text>
            <Text accessibilityRole="header" numberOfLines={1} style={styles.screenTitle}>
              {title}
            </Text>
          </>
        )}
      </View>
      <Pressable
        accessibilityLabel="Open legal information"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenLegal}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <Info color={colors.ink} size={22} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  backButton: {
    marginRight: 4,
  },
  brand: {
    color: colors.ink,
    fontSize: 23,
    fontWeight: '700',
  },
  header: {
    alignItems: 'center',
    backgroundColor: colors.background,
    flexDirection: 'row',
    minHeight: 70,
    paddingBottom: 12,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.56,
  },
  screenTitle: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  tagline: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 3,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
});
