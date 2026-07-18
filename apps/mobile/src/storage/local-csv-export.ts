// SPDX-License-Identifier: GPL-3.0-only
import { File as ExpoFile, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import type { CsvExportFile, CsvExportWriter } from '../features/expenses/expense-csv-export';

const csvFilenamePattern = /^reimbursd-expenses-\d{4}-\d{2}-\d{2}\.csv$/;

export class PlatformCsvExportWriter implements CsvExportWriter {
  async save(file: CsvExportFile): Promise<void> {
    if (!csvFilenamePattern.test(file.filename)) {
      throw new TypeError('CSV export filename is invalid.');
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
    temporaryFile.write(file.contents);

    try {
      await Sharing.shareAsync(temporaryFile.uri, {
        dialogTitle: 'Export Reimbursd expenses',
        mimeType: 'text/csv',
        UTI: 'public.comma-separated-values-text',
      });
    } finally {
      if (temporaryFile.exists) {
        temporaryFile.delete();
      }
    }
  }
}

function saveWebDownload(file: CsvExportFile): void {
  const objectUrl = URL.createObjectURL(
    new Blob([file.contents], { type: 'text/csv;charset=utf-8' }),
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
