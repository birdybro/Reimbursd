// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';
import { Save } from 'lucide-react-native';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { FieldEvidence, Receipt, SupportedCurrencyCode } from '@reimbursd/domain';
import {
  ReceiptConflictError,
  ReceiptNotFoundError,
  ReceiptReviewConflictError,
} from '@reimbursd/database';

import { CurrencyPickerModal } from '../../components/CurrencyPickerModal';
import { colors } from '../../theme';
import {
  createEmptyExpenseForm,
  parseExpenseForm,
  receiptToExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormField,
  type ExpenseFormSubmission,
  type ExpenseFormValues,
} from './expense-form';
import { receiptToReviewExpenseForm } from './expense-review';

interface ExpenseFormScreenProps {
  readonly onSubmit: (submission: ExpenseFormSubmission) => Promise<void>;
  readonly receipt: Receipt | undefined;
  readonly suggestions?: readonly FieldEvidence[];
}

interface FormFieldProps {
  readonly error: string | undefined;
  readonly field: ExpenseFormField;
  readonly keyboardType?: 'decimal-pad' | 'default';
  readonly label: string;
  readonly multiline?: boolean;
  readonly onChange: (field: ExpenseFormField, value: string) => void;
  readonly placeholder?: string;
  readonly value: string;
}

export function ExpenseFormScreen({ onSubmit, receipt, suggestions = [] }: ExpenseFormScreenProps) {
  const [currencyVisible, setCurrencyVisible] = useState(false);
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<ExpenseFormValues>(() =>
    receipt === undefined
      ? createEmptyExpenseForm(new Date())
      : suggestions.length === 0
        ? receiptToExpenseForm(receipt)
        : receiptToReviewExpenseForm(receipt, suggestions),
  );
  const reviewingSuggestions = suggestions.length > 0;

  const changeField = (field: ExpenseFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => removeError(current, field));
    setSaveError(null);
  };

  const save = async () => {
    const result = parseExpenseForm(values, {
      idFactory: randomUUID,
      now: new Date(),
      timezoneOffsetMinutes: getTimezoneOffsetForLocalDate(values.purchaseDate),
      ...(receipt === undefined ? {} : { receipt }),
    });

    if (!result.success) {
      setErrors(result.errors);
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(result.submission);
    } catch (error) {
      setSaveError(getSaveErrorMessage(error));
      setSaving(false);
    }
  };

  const selectCurrency = (currencyCode: SupportedCurrencyCode | null) => {
    if (currencyCode !== null) {
      setValues((current) => ({ ...current, currencyCode }));
      setErrors((current) => removeError(current, 'currencyCode'));
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <Text style={styles.introTitle}>
            {receipt === undefined
              ? 'Manual expense'
              : reviewingSuggestions
                ? 'Review receipt'
                : 'Edit expense'}
          </Text>
          <Text style={styles.introCopy}>Amounts are saved in minor currency units.</Text>
        </View>

        <FormField
          error={errors.merchantName}
          field="merchantName"
          label="Merchant"
          onChange={changeField}
          placeholder="Merchant name"
          value={values.merchantName}
        />
        <FormField
          error={errors.purchaseDate}
          field="purchaseDate"
          label="Purchase date"
          onChange={changeField}
          placeholder="YYYY-MM-DD"
          value={values.purchaseDate}
        />

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Currency</Text>
          <Pressable
            accessibilityLabel={`Currency, ${values.currencyCode}`}
            accessibilityRole="button"
            onPress={() => setCurrencyVisible(true)}
            style={({ pressed }) => [styles.currencyButton, pressed && styles.pressed]}
          >
            <Text style={styles.currencyText}>{values.currencyCode}</Text>
            <Text style={styles.currencyAction}>Change</Text>
          </Pressable>
          {errors.currencyCode === undefined ? null : (
            <Text accessibilityLiveRegion="polite" style={styles.errorText}>
              {errors.currencyCode}
            </Text>
          )}
        </View>

        <View style={styles.amountGrid}>
          <View style={styles.amountColumn}>
            <FormField
              error={errors.subtotal}
              field="subtotal"
              keyboardType="decimal-pad"
              label="Subtotal"
              onChange={changeField}
              placeholder="0.00"
              value={values.subtotal}
            />
          </View>
          <View style={styles.amountColumn}>
            <FormField
              error={errors.tax}
              field="tax"
              keyboardType="decimal-pad"
              label="Tax"
              onChange={changeField}
              placeholder="0.00"
              value={values.tax}
            />
          </View>
          <View style={styles.amountColumn}>
            <FormField
              error={errors.tip}
              field="tip"
              keyboardType="decimal-pad"
              label="Tip"
              onChange={changeField}
              placeholder="0.00"
              value={values.tip}
            />
          </View>
          <View style={styles.amountColumn}>
            <FormField
              error={errors.discount}
              field="discount"
              keyboardType="decimal-pad"
              label="Discount"
              onChange={changeField}
              placeholder="0.00"
              value={values.discount}
            />
          </View>
        </View>

        <FormField
          error={errors.total}
          field="total"
          keyboardType="decimal-pad"
          label="Total"
          onChange={changeField}
          placeholder="0.00"
          value={values.total}
        />
        <FormField
          error={errors.notes}
          field="notes"
          label="Notes"
          multiline
          onChange={changeField}
          placeholder="Optional notes"
          value={values.notes}
        />

        {saveError === null ? null : (
          <Text accessibilityLiveRegion="assertive" style={styles.saveError}>
            {saveError}
          </Text>
        )}

        <Pressable
          accessibilityLabel={
            receipt === undefined
              ? 'Save manual expense'
              : reviewingSuggestions
                ? 'Save reviewed expense'
                : 'Save expense changes'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={save}
          style={({ pressed }) => [
            styles.saveButton,
            saving && styles.saveButtonDisabled,
            pressed && styles.saveButtonPressed,
          ]}
        >
          <Save color={colors.paper} size={20} strokeWidth={2.3} />
          <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Save expense'}</Text>
        </Pressable>
      </ScrollView>

      <CurrencyPickerModal
        onClose={() => setCurrencyVisible(false)}
        onSelect={selectCurrency}
        value={values.currencyCode}
        visible={currencyVisible}
      />
    </KeyboardAvoidingView>
  );
}

function FormField({
  error,
  field,
  keyboardType = 'default',
  label,
  multiline = false,
  onChange,
  placeholder,
  value,
}: FormFieldProps) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={(nextValue) => onChange(field, nextValue)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={[
          styles.input,
          multiline && styles.multilineInput,
          error !== undefined && styles.inputError,
        ]}
        value={value}
      />
      {error === undefined ? null : (
        <Text accessibilityLiveRegion="polite" style={styles.errorText}>
          {error}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  amountColumn: {
    flexBasis: 150,
    flexGrow: 1,
  },
  amountGrid: {
    columnGap: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  content: {
    alignSelf: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
    width: '100%',
    maxWidth: 720,
  },
  currencyAction: {
    color: colors.green,
    fontSize: 14,
    fontWeight: '700',
  },
  currencyButton: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  currencyText: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  fieldBlock: {
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputError: {
    borderColor: colors.danger,
    borderWidth: 2,
  },
  intro: {
    marginBottom: 22,
    paddingTop: 12,
  },
  introCopy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  introTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: '700',
  },
  label: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 7,
  },
  multilineInput: {
    minHeight: 96,
    textAlignVertical: 'top',
  },
  pressed: {
    opacity: 0.65,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 50,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonPressed: {
    backgroundColor: '#11543c',
  },
  saveButtonText: {
    color: colors.paper,
    fontSize: 16,
    fontWeight: '700',
  },
  saveError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
    padding: 12,
  },
  screen: {
    flex: 1,
  },
});

function removeError(errors: ExpenseFormErrors, field: ExpenseFormField): ExpenseFormErrors {
  const nextErrors = { ...errors };
  delete nextErrors[field];
  return nextErrors;
}

function getTimezoneOffsetForLocalDate(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number);

  if (year === undefined || month === undefined || day === undefined) {
    return new Date().getTimezoneOffset();
  }

  return new Date(year, month - 1, day, 12).getTimezoneOffset();
}

function getSaveErrorMessage(error: unknown): string {
  if (
    error instanceof ReceiptConflictError ||
    error instanceof ReceiptNotFoundError ||
    error instanceof ReceiptReviewConflictError
  ) {
    return 'This expense changed or was removed. Your entries are still here; go back and reopen the expense before editing again.';
  }

  return 'The expense could not be saved. Your entries are still here; try again.';
}
