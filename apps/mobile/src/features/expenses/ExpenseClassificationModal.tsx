// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'expo-crypto';
import { Check, Circle, Plus, Save, Square, X } from 'lucide-react-native';
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

import {
  ClassificationConflictError,
  ClassificationDuplicateNameError,
  ClassificationNotFoundError,
  ReceiptConflictError,
  type CategoryRepository,
  type ReceiptClassification,
  type ReceiptClassificationRepository,
  type TagRepository,
} from '@reimbursd/database';
import {
  createCategory,
  createTag,
  type Category,
  type Receipt,
  type Tag,
} from '@reimbursd/domain';

import { colors } from '../../theme';

interface ExpenseClassificationModalProps {
  readonly categories: CategoryRepository;
  readonly classification: ReceiptClassificationRepository;
  readonly onClose: () => void;
  readonly onSaved: (classification: ReceiptClassification) => void;
  readonly receipt: Receipt;
  readonly tags: TagRepository;
}

export function ExpenseClassificationModal({
  categories: categoryRepository,
  classification: classificationRepository,
  onClose,
  onSaved,
  receipt,
  tags: tagRepository,
}: ExpenseClassificationModalProps) {
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingTag, setCreatingTag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedClassification, setLoadedClassification] = useState<ReceiptClassification | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTagName, setNewTagName] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<ReadonlySet<string>>(new Set());
  const [tags, setTags] = useState<readonly Tag[]>([]);

  useEffect(() => {
    let active = true;

    Promise.all([
      categoryRepository.list(),
      tagRepository.list(),
      classificationRepository.getByReceiptId(receipt.id),
    ])
      .then(([nextCategories, nextTags, nextClassification]) => {
        if (!active) {
          return;
        }

        setCategories(nextCategories);
        setTags(nextTags);
        setLoadedClassification(nextClassification);
        setSelectedCategoryId(nextClassification.category?.id ?? null);
        setSelectedTagIds(new Set(nextClassification.tags.map(({ id }) => id)));
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('Categories and tags could not be loaded. Close this panel and try again.');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [categoryRepository, classificationRepository, receipt.id, tagRepository]);

  const addCategory = async (): Promise<void> => {
    const timestamp = new Date().toISOString();
    setCreatingCategory(true);
    setError(null);

    try {
      const category = await categoryRepository.create(
        createCategory({ createdAt: timestamp, id: randomUUID(), name: newCategoryName }),
      );
      setCategories((current) => sortClassifications([...current, category]));
      setSelectedCategoryId(category.id);
      setNewCategoryName('');
    } catch (nextError) {
      setError(getClassificationErrorMessage(nextError, 'category'));
    } finally {
      setCreatingCategory(false);
    }
  };

  const addTag = async (): Promise<void> => {
    const timestamp = new Date().toISOString();
    setCreatingTag(true);
    setError(null);

    try {
      const tag = await tagRepository.create(
        createTag({ createdAt: timestamp, id: randomUUID(), name: newTagName }),
      );
      setTags((current) => sortClassifications([...current, tag]));
      setSelectedTagIds((current) => new Set([...current, tag.id]));
      setNewTagName('');
    } catch (nextError) {
      setError(getClassificationErrorMessage(nextError, 'tag'));
    } finally {
      setCreatingTag(false);
    }
  };

  const save = async (): Promise<void> => {
    if (loadedClassification === null) {
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await classificationRepository.update({
        categoryId: selectedCategoryId,
        expectedVersion: loadedClassification.receipt.version,
        receiptId: loadedClassification.receipt.id,
        tagIds: [...selectedTagIds],
        updatedAt: new Date().toISOString(),
      });
      onSaved(result);
    } catch (nextError) {
      setError(getSaveErrorMessage(nextError));
      setSaving(false);
    }
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((current) => {
      const next = new Set(current);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible>
      <View style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.panel}>
          <View style={styles.header}>
            <Text accessibilityRole="header" style={styles.title}>
              Classify expense
            </Text>
            <Pressable
              accessibilityLabel="Close classification"
              accessibilityRole="button"
              onPress={onClose}
              style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
            >
              <X color={colors.ink} size={21} strokeWidth={2.2} />
            </Pressable>
          </View>

          {loading ? (
            <View accessibilityLabel="Loading categories and tags" style={styles.loading}>
              <ActivityIndicator color={colors.green} size="small" />
            </View>
          ) : loadedClassification === null ? (
            <View style={styles.loadFailureSpace} />
          ) : (
            <ScrollView
              contentContainerStyle={styles.content}
              keyboardShouldPersistTaps="handled"
              style={styles.scroll}
            >
              <Text style={styles.sectionLabel}>Category</Text>
              <OptionRow
                label="Uncategorized"
                onPress={() => setSelectedCategoryId(null)}
                selected={selectedCategoryId === null}
                type="radio"
              />
              {categories.map((category) => (
                <OptionRow
                  key={category.id}
                  label={category.name}
                  onPress={() => setSelectedCategoryId(category.id)}
                  selected={selectedCategoryId === category.id}
                  type="radio"
                />
              ))}
              <CreateRow
                accessibilityLabel="New category name"
                busy={creatingCategory}
                onAdd={() => void addCategory()}
                onChange={setNewCategoryName}
                placeholder="New category"
                value={newCategoryName}
              />

              <Text style={[styles.sectionLabel, styles.tagsLabel]}>Tags</Text>
              {tags.length === 0 ? <Text style={styles.empty}>No tags</Text> : null}
              {tags.map((tag) => (
                <OptionRow
                  key={tag.id}
                  label={tag.name}
                  onPress={() => toggleTag(tag.id)}
                  selected={selectedTagIds.has(tag.id)}
                  type="checkbox"
                />
              ))}
              <CreateRow
                accessibilityLabel="New tag name"
                busy={creatingTag}
                onAdd={() => void addTag()}
                onChange={setNewTagName}
                placeholder="New tag"
                value={newTagName}
              />
            </ScrollView>
          )}

          {error === null ? null : (
            <Text accessibilityLiveRegion="assertive" style={styles.error}>
              {error}
            </Text>
          )}

          <Pressable
            accessibilityLabel="Save expense classification"
            accessibilityRole="button"
            accessibilityState={{
              disabled:
                loading ||
                loadedClassification === null ||
                saving ||
                creatingCategory ||
                creatingTag,
            }}
            disabled={
              loading || loadedClassification === null || saving || creatingCategory || creatingTag
            }
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.saveButton,
              (loading ||
                loadedClassification === null ||
                saving ||
                creatingCategory ||
                creatingTag) &&
                styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Save color={colors.paper} size={19} strokeWidth={2.3} />
            <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

interface OptionRowProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly selected: boolean;
  readonly type: 'checkbox' | 'radio';
}

function OptionRow({ label, onPress, selected, type }: OptionRowProps) {
  const Icon = type === 'checkbox' ? Square : Circle;
  return (
    <Pressable
      accessibilityLabel={`${label}, ${selected ? 'selected' : 'not selected'}`}
      accessibilityRole={type}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.pressed,
      ]}
    >
      {selected ? (
        <View style={styles.selectedIcon}>
          <Check color={colors.paper} size={15} strokeWidth={3} />
        </View>
      ) : (
        <Icon color={colors.muted} size={20} strokeWidth={1.8} />
      )}
      <Text style={styles.optionText}>{label}</Text>
    </Pressable>
  );
}

interface CreateRowProps {
  readonly accessibilityLabel: string;
  readonly busy: boolean;
  readonly onAdd: () => void;
  readonly onChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}

function CreateRow({
  accessibilityLabel,
  busy,
  onAdd,
  onChange,
  placeholder,
  value,
}: CreateRowProps) {
  const disabled = busy || value.trim().length === 0;
  return (
    <View style={styles.createRow}>
      <TextInput
        accessibilityLabel={accessibilityLabel}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        style={styles.input}
        value={value}
      />
      <Pressable
        accessibilityLabel={`Add ${placeholder.toLocaleLowerCase('en-US')}`}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={onAdd}
        style={({ pressed }) => [
          styles.addButton,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color={colors.paper} size="small" />
        ) : (
          <Plus color={colors.paper} size={19} strokeWidth={2.4} />
        )}
        <Text style={styles.addText}>Add</Text>
      </Pressable>
    </View>
  );
}

function sortClassifications<Record extends Category>(
  records: readonly Record[],
): readonly Record[] {
  return [...records].sort((left, right) =>
    left.normalizedName === right.normalizedName
      ? left.id.localeCompare(right.id)
      : left.normalizedName.localeCompare(right.normalizedName),
  );
}

function getClassificationErrorMessage(error: unknown, kind: 'category' | 'tag'): string {
  if (error instanceof ClassificationDuplicateNameError) {
    return `That ${kind} already exists.`;
  }

  if (error instanceof Error && 'issues' in error) {
    return `Enter a ${kind} name between 1 and 80 characters.`;
  }

  return `The ${kind} could not be created. Try again.`;
}

function getSaveErrorMessage(error: unknown): string {
  if (
    error instanceof ReceiptConflictError ||
    error instanceof ClassificationConflictError ||
    error instanceof ClassificationNotFoundError
  ) {
    return 'This expense or its classifications changed. Close this panel, reload, and try again.';
  }

  return 'The classification could not be saved. Your selections are still here; try again.';
}

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  addText: { color: colors.paper, fontSize: 14, fontWeight: '700' },
  backdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  content: { paddingBottom: 8 },
  createRow: { flexDirection: 'row', gap: 8, marginTop: 10 },
  disabled: { opacity: 0.55 },
  empty: { color: colors.muted, fontSize: 14, paddingVertical: 10 },
  error: {
    backgroundColor: colors.dangerSoft,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
    padding: 10,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  iconButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.ink,
    flex: 1,
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  loading: { alignItems: 'center', justifyContent: 'center', minHeight: 220 },
  loadFailureSpace: { minHeight: 120 },
  option: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 6,
  },
  optionSelected: { backgroundColor: colors.softGreen },
  optionText: { color: colors.ink, flex: 1, fontSize: 15 },
  panel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    maxHeight: '90%',
    maxWidth: 560,
    padding: 18,
    width: '100%',
  },
  pressed: { opacity: 0.65 },
  saveButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  saveText: { color: colors.paper, fontSize: 15, fontWeight: '700' },
  scroll: { flexShrink: 1 },
  sectionLabel: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
    paddingBottom: 5,
    paddingTop: 16,
  },
  selectedIcon: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 10,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  tagsLabel: { marginTop: 8 },
  title: { color: colors.ink, fontSize: 20, fontWeight: '700' },
});
