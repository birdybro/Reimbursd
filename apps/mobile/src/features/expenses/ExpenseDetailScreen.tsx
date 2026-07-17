// SPDX-License-Identifier: GPL-3.0-only
import {
  Crosshair,
  FileImage,
  FileText,
  Pencil,
  ShieldCheck,
  Tags,
  Trash2,
} from 'lucide-react-native';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useState } from 'react';

import type { AttachmentCleanupFailure, ReceiptDeletionCoordinator } from '@reimbursd/attachments';
import type {
  FieldEvidenceRepository,
  ProcessingHistoryRepository,
  CategoryRepository,
  ReceiptClassificationRepository,
  ReceiptDocumentRepository,
  TagRepository,
} from '@reimbursd/database';
import {
  canSupersedeFieldEvidence,
  evidenceFieldNames,
  formatMinorUnits,
  isSupportedCurrencyCode,
  type FieldEvidence,
  type ProcessingHistory,
  type Receipt,
  type ReceiptDocument,
} from '@reimbursd/domain';

import type { LocalAttachmentStorage } from '../../storage/local-attachments';
import { colors } from '../../theme';
import { formatPurchaseDate } from './display';
import { ExpenseClassificationModal } from './ExpenseClassificationModal';

interface ExpenseDetailScreenProps {
  readonly attachmentStorage: Pick<LocalAttachmentStorage, 'openForDisplay'>;
  readonly categoryRepository: CategoryRepository;
  readonly deletionCoordinator: Pick<
    ReceiptDeletionCoordinator,
    'cleanupDocuments' | 'deleteReceipt'
  >;
  readonly documentRepository: ReceiptDocumentRepository;
  readonly evidenceRepository: FieldEvidenceRepository;
  readonly onCleanupNeeded: () => void;
  readonly onClassified: (receipt: Receipt) => void;
  readonly onDeleted: () => void;
  readonly onEdit: (
    suggestions: readonly FieldEvidence[],
    processingHistoryIds: readonly string[],
  ) => void;
  readonly onRefreshCleanup: () => Promise<void>;
  readonly processingHistoryRepository: ProcessingHistoryRepository;
  readonly receiptClassificationRepository: ReceiptClassificationRepository;
  readonly receipt: Receipt;
  readonly tagRepository: TagRepository;
}

type PreviewDisplayState =
  | { readonly reference: string; readonly status: 'error' }
  | { readonly reference: string; readonly status: 'ready'; readonly uri: string }
  | null;

export function ExpenseDetailScreen({
  attachmentStorage,
  categoryRepository,
  deletionCoordinator,
  documentRepository,
  evidenceRepository,
  onCleanupNeeded,
  onClassified,
  onDeleted,
  onEdit,
  onRefreshCleanup,
  processingHistoryRepository,
  receiptClassificationRepository,
  receipt,
  tagRepository,
}: ExpenseDetailScreenProps) {
  const [classification, setClassification] = useState<Awaited<
    ReturnType<ReceiptClassificationRepository['getByReceiptId']>
  > | null>(null);
  const [classificationError, setClassificationError] = useState(false);
  const [classificationLoading, setClassificationLoading] = useState(true);
  const [classificationVisible, setClassificationVisible] = useState(false);
  const [confirmationVisible, setConfirmationVisible] = useState(false);
  const [cleanupFailures, setCleanupFailures] = useState<readonly AttachmentCleanupFailure[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [documents, setDocuments] = useState<readonly ReceiptDocument[]>([]);
  const [documentsError, setDocumentsError] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(true);
  const [evidence, setEvidence] = useState<readonly FieldEvidence[]>([]);
  const [evidenceError, setEvidenceError] = useState(false);
  const [previewDisplay, setPreviewDisplay] = useState<PreviewDisplayState>(null);
  const [previewLayout, setPreviewLayout] = useState<PreviewLayout | null>(null);
  const [processingHistory, setProcessingHistory] = useState<readonly ProcessingHistory[]>([]);
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    receiptClassificationRepository
      .getByReceiptId(receipt.id)
      .then((result) => {
        if (active) {
          setClassification(result);
          setClassificationError(false);
          setClassificationLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setClassificationError(true);
          setClassificationLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [receipt.id, receiptClassificationRepository]);

  useEffect(() => {
    let active = true;

    documentRepository
      .listByReceiptId(receipt.id)
      .then((result) => {
        if (active) {
          setDocuments(result);
          setDocumentsError(false);
          setDocumentsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setDocumentsError(true);
          setDocumentsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [documentRepository, receipt.id]);

  useEffect(() => {
    let active = true;

    evidenceRepository
      .listByReceiptId(receipt.id)
      .then((result) => {
        if (active) {
          setEvidence(result);
          setEvidenceError(false);
        }
      })
      .catch(() => {
        if (active) {
          setEvidenceError(true);
        }
      });

    return () => {
      active = false;
    };
  }, [evidenceRepository, receipt.id]);

  useEffect(() => {
    let active = true;

    processingHistoryRepository
      .listByReceiptId(receipt.id)
      .then((result) => {
        if (active) {
          setProcessingHistory(result);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [processingHistoryRepository, receipt.id]);

  const previewDocument = documents.find(
    (document) => !document.isOriginal && document.sourceType === 'derivative',
  );

  useEffect(() => {
    let active = true;
    let release: (() => void) | undefined;

    if (previewDocument === undefined) {
      return () => {
        active = false;
      };
    }

    attachmentStorage
      .openForDisplay(previewDocument.storageReference)
      .then((opened) => {
        if (!active) {
          opened.release();
          return;
        }

        release = opened.release;
        setPreviewDisplay({
          reference: previewDocument.storageReference,
          status: 'ready',
          uri: opened.uri,
        });
      })
      .catch(() => {
        if (active) {
          setPreviewDisplay({
            reference: previewDocument.storageReference,
            status: 'error',
          });
        }
      });

    return () => {
      active = false;
      release?.();
    };
  }, [attachmentStorage, previewDocument]);

  const hasOriginal = documents.some((document) => document.isOriginal);
  const latestOcrHistory = processingHistory
    .filter((history) => history.processorName === 'reimbursd-receipt-ocr')
    .at(-1);
  const latestParserHistory = processingHistory
    .filter((history) => history.processorName === 'reimbursd-deterministic-parser')
    .at(-1);
  const suggestions = getPreferredSuggestions(evidence);
  const pendingProcessingHistoryIds = processingHistory
    .filter((history) => history.status === 'succeeded' && history.reviewStatus === 'pending')
    .map(({ id }) => id);
  const suggestedCurrencyCode = getSuggestedCurrencyCode(suggestions, receipt.currencyCode);
  const processingSummary = getProcessingSummary(
    hasOriginal,
    latestOcrHistory,
    latestParserHistory,
    suggestions.length,
  );
  const hasImageOriginal = documents.some(
    (document) => document.isOriginal && document.mimeType !== 'application/pdf',
  );
  const currentPreviewDisplay =
    previewDocument !== undefined && previewDisplay?.reference === previewDocument.storageReference
      ? previewDisplay
      : null;
  const previewError = currentPreviewDisplay?.status === 'error';
  const previewLoading = previewDocument !== undefined && currentPreviewDisplay === null;
  const previewUri = currentPreviewDisplay?.status === 'ready' ? currentPreviewDisplay.uri : null;
  const selectedEvidence = suggestions.find(({ id }) => id === selectedEvidenceId);
  const highlightStyle = getHighlightStyle(selectedEvidence, previewDocument, previewLayout);

  const deleteReceipt = async () => {
    setDeleting(true);
    setDeleteError(null);

    try {
      const result =
        cleanupFailures.length === 0
          ? await deletionCoordinator.deleteReceipt(
              receipt.id,
              receipt.version,
              new Date().toISOString(),
            )
          : {
              attachmentCleanupFailures: await deletionCoordinator.cleanupDocuments(
                cleanupFailures.map(({ document }) => document),
              ),
              receipt,
            };
      setConfirmationVisible(false);

      if (result.attachmentCleanupFailures.length === 0) {
        await onRefreshCleanup();
        onDeleted();
        return;
      }

      setCleanupFailures(result.attachmentCleanupFailures);
      onCleanupNeeded();
      setDeleteError(
        `The expense record was removed, but ${result.attachmentCleanupFailures.length} local receipt ${result.attachmentCleanupFailures.length === 1 ? 'file still needs' : 'files still need'} deletion. Retry now or from the expense list.`,
      );
    } catch {
      setConfirmationVisible(false);
      setDeleteError(
        cleanupFailures.length === 0
          ? 'The expense could not be deleted. Reload it and try again.'
          : 'Receipt file deletion failed again. The app will keep retrying without restoring the expense.',
      );
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.titleRow}>
        <View style={styles.titleCopy}>
          <Text accessibilityRole="header" style={styles.merchant}>
            {receipt.merchantName}
          </Text>
          <Text style={styles.date}>{formatPurchaseDate(receipt.purchasedAt)}</Text>
        </View>
        <Text style={styles.total}>
          {formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
        </Text>
      </View>

      <View
        accessibilityLabel={
          hasOriginal ? 'Receipt imported and preserved locally' : 'Locally entered manual expense'
        }
        style={styles.provenance}
      >
        <ShieldCheck color={colors.green} size={20} strokeWidth={2} />
        <View style={styles.provenanceCopy}>
          <Text style={styles.provenanceTitle}>{processingSummary.title}</Text>
          <Text style={styles.provenanceDetail}>{processingSummary.detail}</Text>
        </View>
      </View>

      {previewLoading ? (
        <View accessibilityLabel="Loading generated receipt preview" style={styles.previewLoading}>
          <ActivityIndicator color={colors.green} size="small" />
        </View>
      ) : previewUri !== null && previewDocument !== undefined ? (
        <View
          accessibilityLabel="Generated local receipt preview"
          onLayout={(event: LayoutChangeEvent) => {
            setPreviewLayout({
              height: event.nativeEvent.layout.height,
              width: event.nativeEvent.layout.width,
            });
          }}
          style={[
            styles.previewFrame,
            {
              aspectRatio: getPreviewAspectRatio(previewDocument),
            },
          ]}
        >
          <Image
            accessibilityLabel="Receipt preview"
            resizeMode="contain"
            source={{ uri: previewUri }}
            style={styles.previewImage}
          />
          {highlightStyle === null ? null : (
            <View
              accessibilityLabel="Receipt source highlight"
              pointerEvents="none"
              style={[styles.sourceHighlight, highlightStyle]}
            />
          )}
        </View>
      ) : previewError || (!documentsLoading && !documentsError && hasImageOriginal) ? (
        <Text accessibilityLiveRegion="polite" style={styles.previewError}>
          A display preview is unavailable. The original receipt file remains preserved locally.
        </Text>
      ) : null}

      {evidenceError ? (
        <Text accessibilityLiveRegion="polite" style={styles.documentError}>
          Suggested values could not be loaded. Saved expense values remain available.
        </Text>
      ) : suggestions.length === 0 ? null : (
        <View style={styles.suggestionsSection}>
          <Text style={styles.sectionLabel}>Suggested values</Text>
          <View style={styles.suggestionRows}>
            {suggestions.map((suggestion) => (
              <SuggestionRow
                currencyCode={suggestedCurrencyCode}
                evidence={suggestion}
                highlightAvailable={
                  previewUri !== null &&
                  previewDocument?.widthPixels !== null &&
                  previewDocument?.widthPixels !== undefined &&
                  previewDocument.heightPixels !== null
                }
                key={suggestion.id}
                onSelect={() => setSelectedEvidenceId(suggestion.id)}
                selected={suggestion.id === selectedEvidenceId}
              />
            ))}
          </View>
        </View>
      )}

      {documentsLoading ? (
        <View accessibilityLabel="Loading receipt files" style={styles.documentLoading}>
          <ActivityIndicator color={colors.green} size="small" />
        </View>
      ) : documentsError ? (
        <Text accessibilityLiveRegion="polite" style={styles.documentError}>
          Receipt file details could not be loaded. The expense data is still available.
        </Text>
      ) : documents.length === 0 ? null : (
        <View style={styles.documentsSection}>
          <Text style={styles.sectionLabel}>Receipt files</Text>
          {documents.map((document) => (
            <DocumentRow document={document} key={document.id} />
          ))}
        </View>
      )}

      <Text style={styles.savedValuesLabel}>Saved values</Text>
      <View style={styles.amounts}>
        <AmountRow
          label="Subtotal"
          value={formatMinorUnits(receipt.subtotalMinor, receipt.currencyCode)}
        />
        <AmountRow label="Tax" value={formatMinorUnits(receipt.taxMinor, receipt.currencyCode)} />
        <AmountRow label="Tip" value={formatMinorUnits(receipt.tipMinor, receipt.currencyCode)} />
        <AmountRow
          label="Discount"
          value={formatMinorUnits(receipt.discountMinor, receipt.currencyCode)}
        />
        <View style={styles.totalDivider} />
        <AmountRow
          label={`Total (${receipt.currencyCode})`}
          strong
          value={formatMinorUnits(receipt.totalMinor, receipt.currencyCode)}
        />
      </View>

      <View style={styles.classificationSection}>
        <Text style={styles.sectionLabel}>Classification</Text>
        {classificationLoading ? (
          <ActivityIndicator
            accessibilityLabel="Loading expense classification"
            color={colors.green}
            size="small"
            style={styles.classificationLoading}
          />
        ) : classificationError ? (
          <Text accessibilityLiveRegion="polite" style={styles.documentError}>
            Category and tags could not be loaded. Saved expense values remain available.
          </Text>
        ) : (
          <>
            <Text style={styles.classificationValue}>
              {classification?.category?.name ?? 'Uncategorized'}
            </Text>
            {classification?.tags.length ? (
              <View style={styles.tagList}>
                {classification.tags.map((tag) => (
                  <View key={tag.id} style={styles.tag}>
                    <Text style={styles.tagText}>{tag.name}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        )}
      </View>

      {receipt.notes.length === 0 ? null : (
        <View style={styles.notesSection}>
          <Text style={styles.sectionLabel}>Notes</Text>
          <Text style={styles.notes}>{receipt.notes}</Text>
        </View>
      )}

      {deleteError === null ? null : (
        <Text accessibilityLiveRegion="assertive" style={styles.deleteError}>
          {deleteError}
        </Text>
      )}

      <View style={styles.actions}>
        {cleanupFailures.length === 0 ? (
          <Pressable
            accessibilityLabel="Classify expense"
            accessibilityRole="button"
            onPress={() => setClassificationVisible(true)}
            style={({ pressed }) => [styles.classifyButton, pressed && styles.pressed]}
          >
            <Tags color={colors.green} size={19} strokeWidth={2.3} />
            <Text style={styles.classifyText}>Classify</Text>
          </Pressable>
        ) : null}
        {cleanupFailures.length === 0 ? (
          <Pressable
            accessibilityLabel={suggestions.length > 0 ? 'Review suggestions' : 'Edit expense'}
            accessibilityRole="button"
            onPress={() => onEdit(suggestions, pendingProcessingHistoryIds)}
            style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}
          >
            <Pencil color={colors.paper} size={19} strokeWidth={2.3} />
            <Text style={styles.editText}>{suggestions.length > 0 ? 'Review' : 'Edit'}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityLabel={
            cleanupFailures.length === 0 ? 'Delete expense' : 'Retry receipt file deletion'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: deleting }}
          disabled={deleting}
          onPress={() => {
            if (cleanupFailures.length === 0) {
              setConfirmationVisible(true);
            } else {
              void deleteReceipt();
            }
          }}
          style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}
        >
          <Trash2 color={colors.danger} size={19} strokeWidth={2.3} />
          <Text style={styles.deleteText}>
            {deleting
              ? 'Deleting...'
              : cleanupFailures.length === 0
                ? 'Delete'
                : 'Retry file deletion'}
          </Text>
        </Pressable>
      </View>

      <Modal
        animationType="fade"
        onRequestClose={() => setConfirmationVisible(false)}
        transparent
        visible={confirmationVisible}
      >
        <View style={styles.modalBackdrop}>
          <View accessibilityViewIsModal style={styles.modalPanel}>
            <Text accessibilityRole="header" style={styles.modalTitle}>
              Delete expense?
            </Text>
            <Text style={styles.modalCopy}>
              This removes the expense from active records and deletes its local receipt files.
            </Text>
            <View style={styles.modalActions}>
              <Pressable
                accessibilityLabel="Cancel expense deletion"
                accessibilityRole="button"
                disabled={deleting}
                onPress={() => setConfirmationVisible(false)}
                style={({ pressed }) => [styles.modalCancel, pressed && styles.pressed]}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityLabel="Confirm expense deletion"
                accessibilityRole="button"
                accessibilityState={{ disabled: deleting }}
                disabled={deleting}
                onPress={deleteReceipt}
                style={({ pressed }) => [styles.modalDelete, pressed && styles.pressed]}
              >
                <Trash2 color={colors.paper} size={18} strokeWidth={2.3} />
                <Text style={styles.modalDeleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {classificationVisible ? (
        <ExpenseClassificationModal
          categories={categoryRepository}
          classification={receiptClassificationRepository}
          onClose={() => setClassificationVisible(false)}
          onSaved={(result) => {
            setClassification(result);
            setClassificationVisible(false);
            onClassified(result.receipt);
          }}
          receipt={receipt}
          tags={tagRepository}
        />
      ) : null}
    </ScrollView>
  );
}

function getProcessingSummary(
  hasOriginal: boolean,
  ocrHistory: ProcessingHistory | undefined,
  parserHistory: ProcessingHistory | undefined,
  suggestionCount: number,
): { readonly detail: string; readonly title: string } {
  if (!hasOriginal) {
    return { detail: 'Saved and processed locally', title: 'Manual entry' };
  }

  if (parserHistory?.status === 'succeeded' && suggestionCount > 0) {
    return {
      detail: `${suggestionCount} local ${suggestionCount === 1 ? 'field' : 'fields'} to verify`,
      title: 'Suggested values ready',
    };
  }

  if (ocrHistory?.status === 'succeeded') {
    return { detail: 'Text recognized on this device', title: 'Local OCR complete' };
  }

  if (
    ocrHistory?.status === 'failed' &&
    [
      'development_build_required',
      'device_unsupported',
      'native_module_unavailable',
      'unsupported_platform',
    ].includes(ocrHistory.failureCode ?? '')
  ) {
    return { detail: 'Original preserved. Enter values manually.', title: 'Local OCR unavailable' };
  }

  if (ocrHistory?.status === 'failed' || ocrHistory?.status === 'cancelled') {
    return {
      detail: 'Original preserved. Enter values manually.',
      title: 'Local OCR did not finish',
    };
  }

  if (ocrHistory?.status === 'running') {
    return { detail: 'Original preserved on this device', title: 'Local OCR in progress' };
  }

  return { detail: 'Original preserved on this device', title: 'Local receipt file' };
}

interface PreviewLayout {
  readonly height: number;
  readonly width: number;
}

function getPreferredSuggestions(evidence: readonly FieldEvidence[]): readonly FieldEvidence[] {
  return evidenceFieldNames.flatMap((fieldName) => {
    const preferred = evidence
      .filter((item) => item.fieldName === fieldName)
      .reduce<FieldEvidence | null>((current, candidate) => {
        if (current === null || canSupersedeFieldEvidence(candidate, current)) {
          return candidate;
        }

        return current;
      }, null);

    return preferred === null ||
      preferred.acceptedAt !== null ||
      preferred.correctedAt !== null ||
      preferred.sourceType === 'manual' ||
      preferred.sourceType === 'user_correction'
      ? []
      : [preferred];
  });
}

interface SuggestionRowProps {
  readonly currencyCode: Receipt['currencyCode'];
  readonly evidence: FieldEvidence;
  readonly highlightAvailable: boolean;
  readonly onSelect: () => void;
  readonly selected: boolean;
}

function SuggestionRow({
  currencyCode,
  evidence,
  highlightAvailable,
  onSelect,
  selected,
}: SuggestionRowProps) {
  const label = getEvidenceFieldLabel(evidence.fieldName);
  const value = formatEvidenceValue(evidence, currencyCode);
  const confidence = `${Math.round(evidence.confidence * 100)}% confidence`;
  const source = getEvidenceSourceLabel(evidence);
  const content = (
    <>
      <View style={styles.suggestionCopy}>
        <Text style={styles.suggestionLabel}>{label}</Text>
        <Text style={styles.suggestionValue}>{value}</Text>
        <Text style={styles.suggestionMeta}>
          {source.label} | {confidence}
        </Text>
      </View>
      {!highlightAvailable || evidence.boundingBox === null || evidence.pageNumber !== 1 ? null : (
        <Crosshair color={selected ? colors.coral : colors.muted} size={20} strokeWidth={2} />
      )}
    </>
  );

  if (!highlightAvailable || evidence.boundingBox === null || evidence.pageNumber !== 1) {
    return <View style={styles.suggestionRow}>{content}</View>;
  }

  return (
    <Pressable
      accessibilityLabel={`Suggested ${label}, ${value}, ${confidence}, processed ${source.location}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onSelect}
      style={({ pressed }) => [
        styles.suggestionRow,
        selected && styles.suggestionSelected,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

function getEvidenceFieldLabel(fieldName: FieldEvidence['fieldName']): string {
  return {
    currency_code: 'Currency',
    discount_minor: 'Discount',
    merchant_name: 'Merchant',
    purchased_at: 'Purchase date',
    subtotal_minor: 'Subtotal',
    tax_minor: 'Tax',
    tip_minor: 'Tip',
    total_minor: 'Total',
  }[fieldName];
}

function formatEvidenceValue(
  evidence: FieldEvidence,
  currencyCode: Receipt['currencyCode'],
): string {
  if (evidence.fieldName === 'purchased_at') {
    return formatPurchaseDate(evidence.normalizedValue);
  }

  if (evidence.fieldName.endsWith('_minor')) {
    const minorUnits = Number(evidence.normalizedValue);

    if (Number.isSafeInteger(minorUnits)) {
      return formatMinorUnits(minorUnits, currencyCode);
    }
  }

  return evidence.normalizedValue;
}

function getSuggestedCurrencyCode(
  suggestions: readonly FieldEvidence[],
  fallback: Receipt['currencyCode'],
): Receipt['currencyCode'] {
  const currency = suggestions.find(({ fieldName }) => fieldName === 'currency_code');

  return currency !== undefined && isSupportedCurrencyCode(currency.normalizedValue)
    ? currency.normalizedValue
    : fallback;
}

function getEvidenceSourceLabel(evidence: FieldEvidence): {
  readonly label: string;
  readonly location: 'locally' | 'remotely';
} {
  if (evidence.sourceType === 'hosted_ai') {
    return { label: 'Remote AI extraction', location: 'remotely' };
  }

  if (evidence.sourceType === 'hosted_ocr') {
    return { label: 'Remote OCR', location: 'remotely' };
  }

  if (evidence.sourceType === 'deterministic_parser') {
    return { label: 'Local deterministic parser', location: 'locally' };
  }

  if (evidence.sourceType === 'local_ocr') {
    return { label: 'Local OCR', location: 'locally' };
  }

  return { label: 'Imported structured data', location: 'locally' };
}

function getHighlightStyle(
  evidence: FieldEvidence | undefined,
  previewDocument: ReceiptDocument | undefined,
  previewLayout: PreviewLayout | null,
) {
  if (
    evidence?.boundingBox === null ||
    evidence?.boundingBox === undefined ||
    evidence.pageNumber !== 1 ||
    previewDocument?.widthPixels === null ||
    previewDocument?.widthPixels === undefined ||
    previewDocument.heightPixels === null ||
    previewLayout === null
  ) {
    return null;
  }

  const imageAspectRatio = previewDocument.widthPixels / previewDocument.heightPixels;
  const frameAspectRatio = previewLayout.width / previewLayout.height;
  const imageWidth =
    imageAspectRatio > frameAspectRatio
      ? previewLayout.width
      : previewLayout.height * imageAspectRatio;
  const imageHeight =
    imageAspectRatio > frameAspectRatio
      ? previewLayout.width / imageAspectRatio
      : previewLayout.height;
  const horizontalOffset = (previewLayout.width - imageWidth) / 2;
  const verticalOffset = (previewLayout.height - imageHeight) / 2;

  return {
    height: evidence.boundingBox.height * imageHeight,
    left: horizontalOffset + evidence.boundingBox.x * imageWidth,
    top: verticalOffset + evidence.boundingBox.y * imageHeight,
    width: evidence.boundingBox.width * imageWidth,
  };
}

function DocumentRow({ document }: { readonly document: ReceiptDocument }) {
  const sourceLabel = {
    camera: 'Camera capture',
    derivative: 'Derived preview',
    image_import: 'Image import',
    pdf_import: 'PDF import',
  }[document.sourceType];
  const documentDetail =
    document.mimeType === 'application/pdf'
      ? `${document.pageCount} ${document.pageCount === 1 ? 'page' : 'pages'}`
      : `${document.widthPixels} x ${document.heightPixels} px`;

  return (
    <View
      accessibilityLabel={`${document.isOriginal ? 'Original' : 'Derived'} ${document.originalFilename}, ${sourceLabel}`}
      style={styles.documentRow}
    >
      <View style={styles.documentIcon}>
        {document.mimeType === 'application/pdf' ? (
          <FileText color={colors.coral} size={22} strokeWidth={2} />
        ) : (
          <FileImage color={colors.green} size={22} strokeWidth={2} />
        )}
      </View>
      <View style={styles.documentCopy}>
        <Text numberOfLines={1} style={styles.documentName}>
          {document.originalFilename}
        </Text>
        <Text style={styles.documentMeta}>
          {sourceLabel} | {documentDetail} | {formatByteSize(document.byteSize)}
        </Text>
        <Text numberOfLines={1} style={styles.documentHash}>
          SHA-256 {document.sha256}
        </Text>
      </View>
      <Text style={document.isOriginal ? styles.originalBadge : styles.derivativeBadge}>
        {document.isOriginal ? 'Original' : 'Derived'}
      </Text>
    </View>
  );
}

function formatByteSize(byteSize: number): string {
  if (byteSize < 1_024) {
    return `${byteSize} B`;
  }

  if (byteSize < 1_024 * 1_024) {
    return `${(byteSize / 1_024).toFixed(1)} KB`;
  }

  return `${(byteSize / (1_024 * 1_024)).toFixed(1)} MB`;
}

function getPreviewAspectRatio(document: ReceiptDocument): number {
  if (document.widthPixels === null || document.heightPixels === null) {
    return 0.75;
  }

  return Math.min(1.5, Math.max(0.6, document.widthPixels / document.heightPixels));
}

interface AmountRowProps {
  readonly label: string;
  readonly strong?: boolean;
  readonly value: string;
}

function AmountRow({ label, strong = false, value }: AmountRowProps) {
  return (
    <View style={styles.amountRow}>
      <Text style={[styles.amountLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.amountValue, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 24,
  },
  amountLabel: {
    color: colors.muted,
    fontSize: 15,
  },
  amountRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
  },
  amounts: {
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  classificationSection: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 18,
    paddingTop: 22,
  },
  classificationLoading: {
    alignSelf: 'flex-start',
    marginTop: 12,
  },
  classificationValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 8,
  },
  classifyButton: {
    alignItems: 'center',
    borderColor: colors.green,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexBasis: 140,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  classifyText: {
    color: colors.green,
    fontSize: 15,
    fontWeight: '700',
  },
  amountValue: {
    color: colors.ink,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  content: {
    alignSelf: 'center',
    paddingBottom: 40,
    paddingHorizontal: 20,
    paddingTop: 14,
    width: '100%',
    maxWidth: 720,
  },
  date: {
    color: colors.muted,
    fontSize: 14,
    marginTop: 5,
  },
  derivativeBadge: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  documentCopy: {
    flex: 1,
    minWidth: 0,
  },
  documentError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    padding: 11,
  },
  documentHash: {
    color: colors.muted,
    fontFamily: 'monospace',
    fontSize: 10,
    marginTop: 5,
  },
  documentIcon: {
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: 6,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  documentLoading: {
    alignItems: 'center',
    minHeight: 48,
  },
  documentMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  documentName: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  documentRow: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 11,
    minHeight: 78,
    padding: 12,
  },
  documentsSection: {
    gap: 9,
    marginBottom: 22,
  },
  deleteButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    flexBasis: 140,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  deleteError: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 6,
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 18,
    padding: 12,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '700',
  },
  editButton: {
    alignItems: 'center',
    backgroundColor: colors.green,
    borderRadius: 6,
    flex: 1,
    flexBasis: 140,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
  },
  editText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  merchant: {
    color: colors.ink,
    fontSize: 24,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  modalBackdrop: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 34, 29, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  modalCancel: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalCancelText: {
    color: colors.ink,
    fontSize: 15,
    fontWeight: '700',
  },
  modalCopy: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 8,
  },
  modalDelete: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderRadius: 6,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  modalDeleteText: {
    color: colors.paper,
    fontSize: 15,
    fontWeight: '700',
  },
  modalPanel: {
    backgroundColor: colors.paper,
    borderRadius: 8,
    boxShadow: '0 10px 24px rgba(23, 34, 29, 0.18)',
    elevation: 8,
    maxWidth: 420,
    padding: 22,
    width: '100%',
  },
  modalTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: '700',
  },
  previewError: {
    backgroundColor: colors.background,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 18,
    padding: 11,
  },
  previewFrame: {
    alignSelf: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.border,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 18,
    maxHeight: 520,
    overflow: 'hidden',
    width: '100%',
  },
  previewImage: {
    height: '100%',
    width: '100%',
  },
  previewLoading: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 180,
  },
  savedValuesLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 9,
    textTransform: 'uppercase',
  },
  sourceHighlight: {
    backgroundColor: 'rgba(201, 78, 56, 0.14)',
    borderColor: colors.coral,
    borderRadius: 3,
    borderWidth: 2,
    position: 'absolute',
  },
  suggestionCopy: {
    flex: 1,
    minWidth: 0,
  },
  suggestionLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  suggestionMeta: {
    color: colors.muted,
    fontSize: 12,
    marginTop: 4,
  },
  suggestionRow: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 70,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  suggestionRows: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 9,
  },
  suggestionSelected: {
    backgroundColor: colors.softGreen,
  },
  suggestionsSection: {
    marginBottom: 22,
  },
  suggestionValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 4,
  },
  tag: {
    backgroundColor: colors.softGreen,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  tagList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginTop: 10,
  },
  tagText: {
    color: colors.green,
    fontSize: 12,
    fontWeight: '700',
  },
  notes: {
    color: colors.ink,
    fontSize: 15,
    lineHeight: 23,
    marginTop: 8,
  },
  originalBadge: {
    color: colors.green,
    fontSize: 11,
    fontWeight: '700',
  },
  notesSection: {
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 18,
    paddingTop: 22,
  },
  pressed: {
    opacity: 0.65,
  },
  provenance: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginBottom: 22,
    minHeight: 66,
  },
  provenanceCopy: {
    marginLeft: 11,
  },
  provenanceDetail: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 3,
  },
  provenanceTitle: {
    color: colors.ink,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionLabel: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  strong: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '700',
  },
  titleCopy: {
    flex: 1,
    minWidth: 0,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  total: {
    color: colors.green,
    fontSize: 22,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    textAlign: 'right',
  },
  totalDivider: {
    backgroundColor: colors.border,
    height: StyleSheet.hairlineWidth,
  },
});
