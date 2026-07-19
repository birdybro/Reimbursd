// SPDX-License-Identifier: GPL-3.0-only
import { getDocumentAsync } from 'expo-document-picker';

import { defaultEncryptedBackupLimits } from '@reimbursd/crypto';

import type { PickedLocalFile } from '../../storage/local-attachments';

export interface SelectedEncryptedBackup extends PickedLocalFile {
  readonly reportedByteSize: number | null;
}

export async function selectEncryptedBackup(): Promise<SelectedEncryptedBackup | null> {
  const result = await getDocumentAsync({
    base64: false,
    copyToCacheDirectory: true,
    multiple: false,
    type: ['application/octet-stream', 'application/x-reimbursd-backup'],
  });

  if (result.canceled) {
    return null;
  }

  const asset = result.assets[0];

  if (asset === undefined) {
    throw new Error('The document picker did not return an encrypted backup.');
  }

  if (
    typeof asset.size === 'number' &&
    asset.size > defaultEncryptedBackupLimits.maxEnvelopeByteSize
  ) {
    throw new Error('Choose a Reimbursd backup within the supported file size limit.');
  }

  return { reportedByteSize: asset.size ?? null, uri: asset.uri };
}
