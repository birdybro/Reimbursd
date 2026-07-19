// SPDX-License-Identifier: GPL-3.0-only
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type {
  StructuredExportFile,
  StructuredExportWriter,
} from '../features/expenses/structured-export';

const backupFilenamePattern = /^reimbursd-backup-\d{4}-\d{2}-\d{2}\.rbd$/;
const backupMimeType = 'application/x-reimbursd-backup';

export class PlatformEncryptedBackupWriter implements StructuredExportWriter {
  async save(file: StructuredExportFile): Promise<void> {
    if (!backupFilenamePattern.test(file.filename)) {
      throw new TypeError('Encrypted backup filename is invalid.');
    }

    if (Platform.OS === 'web') {
      saveWebDownload(file);
      return;
    }

    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('File sharing is unavailable on this device.');
    }

    const temporaryFile = new ExpoFile(Paths.cache, file.filename);
    temporaryFile.create({ intermediates: true, overwrite: true });
    temporaryFile.write(file.bytes);

    try {
      await Sharing.shareAsync(temporaryFile.uri, {
        dialogTitle: 'Back up Reimbursd data',
        mimeType: backupMimeType,
        UTI: 'public.data',
      });
    } finally {
      if (temporaryFile.exists) {
        temporaryFile.delete();
      }
    }
  }
}

function saveWebDownload(file: StructuredExportFile): void {
  const objectUrl = URL.createObjectURL(
    new Blob([Uint8Array.from(file.bytes)], { type: backupMimeType }),
  );
  const link = document.createElement('a');
  link.download = file.filename;
  link.href = objectUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
