// SPDX-License-Identifier: GPL-3.0-only
import { Check, X } from 'lucide-react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { SupportedCurrencyCode } from '@reimbursd/domain';

import { colors } from '../theme';

const currencies: readonly SupportedCurrencyCode[] = ['USD', 'CAD', 'EUR', 'GBP', 'AUD', 'JPY'];

interface CurrencyPickerModalProps {
  readonly allowAll?: boolean;
  readonly onClose: () => void;
  readonly onSelect: (currencyCode: SupportedCurrencyCode | null) => void;
  readonly value: SupportedCurrencyCode | null;
  readonly visible: boolean;
}

export function CurrencyPickerModal({
  allowAll = false,
  onClose,
  onSelect,
  value,
  visible,
}: CurrencyPickerModalProps) {
  const choices: readonly (SupportedCurrencyCode | null)[] = allowAll
    ? [null, ...currencies]
    : currencies;

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Currency
            </Text>
            <Pressable
              accessibilityLabel="Close currency menu"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <X color={colors.ink} size={22} strokeWidth={2} />
            </Pressable>
          </View>
          <ScrollView>
            {choices.map((choice) => {
              const selected = value === choice;
              const label = choice ?? 'All currencies';
              return (
                <Pressable
                  accessibilityLabel={label}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={label}
                  onPress={() => {
                    onSelect(choice);
                    onClose();
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.selectedOption,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text style={[styles.optionText, selected && styles.selectedText]}>{label}</Text>
                  {selected ? <Check color={colors.green} size={20} strokeWidth={2.4} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 8,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 6,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  option: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  optionText: {
    color: colors.ink,
    flex: 1,
    fontSize: 16,
  },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(23, 34, 29, 0.18)',
    elevation: 8,
    maxHeight: '80%',
    maxWidth: 420,
    padding: 16,
    width: '100%',
  },
  pressed: {
    opacity: 0.56,
  },
  selectedOption: {
    backgroundColor: colors.softGreen,
  },
  selectedText: {
    color: colors.green,
    fontWeight: '700',
  },
  title: {
    color: colors.ink,
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
  },
});
