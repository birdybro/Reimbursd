// SPDX-License-Identifier: GPL-3.0-only
import { Platform } from 'react-native';
import { getDocumentAsync } from 'expo-document-picker';
import {
  UIImagePickerPreferredAssetRepresentationMode,
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  type ImagePickerAsset,
} from 'expo-image-picker';

import type { ReceiptDocumentSourceType } from '@reimbursd/domain';

export interface SelectedReceiptFile {
  readonly file?: Blob;
  readonly originalFilename: string;
  readonly reportedByteSize?: number;
  readonly sourceType: Exclude<ReceiptDocumentSourceType, 'derivative'>;
  readonly uri: string;
}

export class ReceiptPickerPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReceiptPickerPermissionError';
  }
}

export async function selectCameraReceipt(): Promise<SelectedReceiptFile | null> {
  const permission = await requestCameraPermissionsAsync();

  if (!permission.granted) {
    throw new ReceiptPickerPermissionError(
      'Camera access is off. Enable camera permission in device settings, or import an existing image.',
    );
  }

  const result = await launchCameraAsync({
    allowsEditing: false,
    base64: false,
    exif: false,
    mediaTypes: 'images',
    preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 1,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (asset === undefined) {
    throw new Error('The camera did not return a receipt image.');
  }

  return imageAssetToSelection(asset, 'camera');
}

export async function selectImageReceipt(): Promise<SelectedReceiptFile | null> {
  if (Platform.OS !== 'web') {
    const permission = await requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new ReceiptPickerPermissionError(
        'Photo access is off. Enable photo permission in device settings, or import a PDF.',
      );
    }
  }

  const result = await launchImageLibraryAsync({
    allowsEditing: false,
    allowsMultipleSelection: false,
    base64: false,
    exif: false,
    mediaTypes: 'images',
    preferredAssetRepresentationMode: UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 1,
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (asset === undefined) {
    throw new Error('The photo picker did not return a receipt image.');
  }

  return imageAssetToSelection(asset, 'image_import');
}

export async function selectPdfReceipt(): Promise<SelectedReceiptFile | null> {
  const result = await getDocumentAsync({
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
    type: 'application/pdf',
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (asset === undefined) {
    throw new Error('The document picker did not return a receipt PDF.');
  }

  return withOptionalFile({
    file: asset.file,
    originalFilename: asset.name,
    reportedByteSize: asset.size,
    sourceType: 'pdf_import',
    uri: asset.uri,
  });
}

function imageAssetToSelection(
  asset: ImagePickerAsset,
  sourceType: 'camera' | 'image_import',
): SelectedReceiptFile {
  return withOptionalFile({
    file: asset.file,
    originalFilename: asset.fileName ?? createCameraFilename(asset.mimeType),
    reportedByteSize: asset.fileSize,
    sourceType,
    uri: asset.uri,
  });
}

function createCameraFilename(mimeType: string | undefined): string {
  return `receipt.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

function withOptionalFile(
  selection: Omit<SelectedReceiptFile, 'file' | 'reportedByteSize'> & {
    readonly file: Blob | undefined;
    readonly reportedByteSize: number | undefined;
  },
): SelectedReceiptFile {
  return {
    ...(selection.file === undefined ? {} : { file: selection.file }),
    originalFilename: selection.originalFilename,
    ...(selection.reportedByteSize === undefined
      ? {}
      : { reportedByteSize: selection.reportedByteSize }),
    sourceType: selection.sourceType,
    uri: selection.uri,
  };
}
