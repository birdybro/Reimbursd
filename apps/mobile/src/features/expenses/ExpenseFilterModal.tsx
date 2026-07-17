// SPDX-License-Identifier: GPL-3.0-only
import { Check, Circle, Filter, RotateCcw, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { CategoryRepository, ReceiptListOptions, TagRepository } from '@reimbursd/database';
import {
  supportedCurrencyCodes,
  type Category,
  type SupportedCurrencyCode,
  type Tag,
} from '@reimbursd/domain';

import { colors } from '../../theme';
import {
  emptyExpenseFilters,
  parseExpenseFilters,
  type ExpenseFilterErrors,
  type ExpenseFilterField,
  type ExpenseFilterValues,
} from './expense-filter';

interface ExpenseFilterModalProps {
  readonly categories: CategoryRepository;
  readonly initialValues: ExpenseFilterValues;
  readonly onApply: (values: ExpenseFilterValues, options: ReceiptListOptions) => void;
  readonly onClose: () => void;
  readonly tags: TagRepository;
}

export function ExpenseFilterModal({
  categories: categoryRepository,
  initialValues,
  onApply,
  onClose,
  tags: tagRepository,
}: ExpenseFilterModalProps) {
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [errors, setErrors] = useState<ExpenseFilterErrors>({});
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tags, setTags] = useState<readonly Tag[]>([]);
  const [values, setValues] = useState(initialValues);

  useEffect(() => {
    let active = true;

    Promise.all([categoryRepository.list(), tagRepository.list()])
      .then(([nextCategories, nextTags]) => {
        if (active) {
          setCategories(nextCategories);
          setTags(nextTags);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setLoadError(true);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [categoryRepository, tagRepository]);

  const change = <Field extends ExpenseFilterField>(
    field: Field,
    value: ExpenseFilterValues[Field],
  ) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors({});
  };

  const apply = () => {
    const result = parseExpenseFilters(values);

    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    onApply(values, result.options);
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Filter color={colors.green} size={21} strokeWidth={2.2} />
              <Text accessibilityRole="header" style={styles.title}>
                Filter expenses
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close expense filters"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <X color={colors.ink} size={21} strokeWidth={2.2} />
            </Pressable>
          </View>

          {loading ? (
            <View accessibilityLabel="Loading expense filters" style={styles.loading}>
              <ActivityIndicator color={colors.green} size="small" />
            </View>
          ) : loadError ? (
            <Text accessibilityLiveRegion="assertive" style={styles.loadError}>
              Categories and tags could not be loaded. Close this panel and try again.
            </Text>
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
            >
              <Text style={styles.sectionLabel}>Currency</Text>
              <View style={styles.currencyGrid}>
                <CurrencyChoice
                  currencyCode={null}
                  onPress={() => change('currencyCode', null)}
                  selected={values.currencyCode === null}
                />
                {supportedCurrencyCodes.map((currencyCode) => (
                  <CurrencyChoice
                    currencyCode={currencyCode}
                    key={currencyCode}
                    onPress={() => change('currencyCode', currencyCode)}
                    selected={values.currencyCode === currencyCode}
                  />
                ))}
              </View>
              {errors.currencyCode === undefined ? null : (
                <Text style={styles.errorText}>{errors.currencyCode}</Text>
              )}

              <Text style={styles.sectionLabel}>Purchase date</Text>
              <View style={styles.fieldGrid}>
                <FilterField
                  error={errors.purchasedFrom}
                  label="From date"
                  onChange={(value) => change('purchasedFrom', value)}
                  placeholder="YYYY-MM-DD"
                  value={values.purchasedFrom}
                />
                <FilterField
                  error={errors.purchasedTo}
                  label="To date"
                  onChange={(value) => change('purchasedTo', value)}
                  placeholder="YYYY-MM-DD"
                  value={values.purchasedTo}
                />
              </View>

              <Text style={styles.sectionLabel}>Total amount</Text>
              <View style={styles.fieldGrid}>
                <FilterField
                  error={errors.minimumTotal}
                  keyboardType="decimal-pad"
                  label="Minimum total"
                  onChange={(value) => change('minimumTotal', value)}
                  placeholder="0.00"
                  value={values.minimumTotal}
                />
                <FilterField
                  error={errors.maximumTotal}
                  keyboardType="decimal-pad"
                  label="Maximum total"
                  onChange={(value) => change('maximumTotal', value)}
                  placeholder="0.00"
                  value={values.maximumTotal}
                />
              </View>

              <Text style={styles.sectionLabel}>Category</Text>
              <ChoiceRow
                label="All categories"
                onPress={() => change('categoryId', 'all')}
                selected={values.categoryId === 'all'}
              />
              <ChoiceRow
                label="Uncategorized"
                onPress={() => change('categoryId', null)}
                selected={values.categoryId === null}
              />
              {categories.map((category) => (
                <ChoiceRow
                  key={category.id}
                  label={category.name}
                  onPress={() => change('categoryId', category.id)}
                  selected={values.categoryId === category.id}
                />
              ))}

              <Text style={styles.sectionLabel}>Tag</Text>
              <ChoiceRow
                label="All tags"
                onPress={() => change('tagId', null)}
                selected={values.tagId === null}
              />
              {tags.map((tag) => (
                <ChoiceRow
                  key={tag.id}
                  label={tag.name}
                  onPress={() => change('tagId', tag.id)}
                  selected={values.tagId === tag.id}
                />
              ))}
            </ScrollView>
          )}

          <View style={styles.actions}>
            <Pressable
              accessibilityLabel="Clear expense filters"
              accessibilityRole="button"
              disabled={loading || loadError}
              onPress={() => {
                setValues(emptyExpenseFilters);
                setErrors({});
              }}
              style={({ pressed }) => [styles.clearButton, pressed && styles.pressed]}
            >
              <RotateCcw color={colors.ink} size={18} strokeWidth={2.2} />
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
            <Pressable
              accessibilityLabel="Apply expense filters"
              accessibilityRole="button"
              accessibilityState={{ disabled: loading || loadError }}
              disabled={loading || loadError}
              onPress={apply}
              style={({ pressed }) => [
                styles.applyButton,
                (loading || loadError) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <Filter color={colors.paper} size={18} strokeWidth={2.2} />
              <Text style={styles.applyText}>Apply</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CurrencyChoice({
  currencyCode,
  onPress,
  selected,
}: {
  readonly currencyCode: SupportedCurrencyCode | null;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  const label = currencyCode ?? 'All';
  return (
    <Pressable
      accessibilityLabel={`${label} currencies, ${selected ? 'selected' : 'not selected'}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.currencyChoice,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.currencyText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ChoiceRow({
  label,
  onPress,
  selected,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}, ${selected ? 'selected' : 'not selected'}`}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        selected && styles.choiceSelected,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.selectedIcon}>
          <Check color={colors.paper} size={14} strokeWidth={3} />
        </View>
      ) : (
        <Circle color={colors.muted} size={20} strokeWidth={1.8} />
      )}
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function FilterField({
  error,
  keyboardType = 'default',
  label,
  onChange,
  placeholder,
  value,
}: {
  readonly error: string | undefined;
  readonly keyboardType?: 'decimal-pad' | 'default';
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[styles.input, error !== undefined && styles.inputError]}
        value={value}
      />
      {error === undefined ? null : <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, paddingTop: 14 },
  applyButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 48,
  },
  applyText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  choiceRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 7,
  },
  choiceSelected: { backgroundColor: colors.softGreen },
  choiceText: { color: colors.ink, flex: 1, fontSize: 15 },
  choiceTextSelected: { color: colors.green, fontWeight: '700' },
  clearButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 48,
  },
  clearText: { color: colors.ink, fontSize: 15, fontWeight: '700' },
  content: { paddingBottom: 8 },
  currencyChoice: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexBasis: 68,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 42,
  },
  currencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  currencyText: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.55 },
  errorText: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 5 },
  field: { flex: 1, minWidth: 130 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fieldLabel: { color: colors.ink, fontSize: 13, fontWeight: '700', marginBottom: 6 },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
  },
  iconButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  input: {
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 11,
  },
  inputError: { borderColor: colors.danger, borderWidth: 2 },
  loadError: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginVertical: 18,
    padding: 11,
  },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 260 },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    maxHeight: '92%',
    maxWidth: 620,
    padding: 18,
    width: '100%',
  },
  pressed: { opacity: 0.64 },
  scroll: { flexShrink: 1 },
  sectionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    paddingBottom: 8,
    paddingTop: 17,
    textTransform: 'uppercase',
  },
  selectedIcon: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
});
