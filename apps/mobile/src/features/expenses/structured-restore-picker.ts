// SPDX-License-Identifier: GPL-3.0-only
import { getDocumentAsync } from 'expo-document-picker';

import { defaultStructuredExportParseLimits } from '@reimbursd/export';

import type { PickedLocalFile } from '../../storage/local-attachments';

export interface SelectedStructuredExport extends PickedLocalFile {
  readonly reportedByteSize?: number;
}

export async function selectStructuredExport(): Promise<SelectedStructuredExport | null> {
  const result = await getDocumentAsync({
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/zip', 'application/x-zip-compressed'],
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (asset === undefined) {
    throw new Error('The document picker did not return a restore archive.');
  }

  if (
    asset.size !== undefined &&
    (!Number.isSafeInteger(asset.size) ||
      asset.size <= 0 ||
      asset.size > defaultStructuredExportParseLimits.maxArchiveByteSize)
  ) {
    throw new Error('Choose a Reimbursd export within the supported archive size limit.');
  }

  return {
    ...(asset.file === undefined ? {} : { file: asset.file }),
    ...(asset.size === undefined ? {} : { reportedByteSize: asset.size }),
    uri: asset.uri,
  };
}
