// SPDX-License-Identifier: GPL-3.0-only
import type { LocalDataDeletionRepository, LocalDataDeletionResult } from '@reimbursd/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LocalDataDeletionCoordinator } from './local-data-deletion.js';

const requestedAt = '2026-07-18T09:00:00-06:00';
const deleted: LocalDataDeletionResult = {
  categoryCount: 1,
  documentCount: 2,
  evidenceCount: 1,
  merchantCount: 1,
  processingHistoryCount: 1,
  receiptCount: 1,
  receiptTagCount: 1,
  tagCount: 1,
};

describe('local data deletion coordinator', () => {
  const attachments = { cleanupPending: vi.fn() };
  const repository: LocalDataDeletionRepository = {
    begin: vi.fn(),
    finalize: vi.fn(),
    getPending: vi.fn(),
  };

  beforeEach(() => {
    attachments.cleanupPending.mockReset().mockResolvedValue([]);
    vi.mocked(repository.begin).mockReset().mockResolvedValue({ requestedAt });
    vi.mocked(repository.finalize).mockReset().mockResolvedValue(deleted);
    vi.mocked(repository.getPending).mockReset().mockResolvedValue({ requestedAt });
  });

  it('persists intent, cleans files, and only then finalizes structured data', async () => {
    const calls: string[] = [];
    vi.mocked(repository.begin).mockImplementation(async () => {
      calls.push('begin');
      return { requestedAt };
    });
    attachments.cleanupPending.mockImplementation(async () => {
      calls.push('attachments');
      return [];
    });
    vi.mocked(repository.finalize).mockImplementation(async () => {
      calls.push('finalize');
      return deleted;
    });

    await expect(
      new LocalDataDeletionCoordinator({ attachments, repository }).deleteAll(requestedAt),
    ).resolves.toEqual({ deleted, status: 'completed' });
    expect(calls).toEqual(['begin', 'attachments', 'finalize']);
  });

  it('leaves structured data pending until failed attachment cleanup succeeds', async () => {
    const failure = { document: {} as never, error: new Error('private failure') };
    attachments.cleanupPending.mockResolvedValueOnce([failure]).mockResolvedValueOnce([]);
    const coordinator = new LocalDataDeletionCoordinator({ attachments, repository });

    await expect(coordinator.deleteAll(requestedAt)).resolves.toEqual({
      attachmentCleanupFailures: [failure],
      status: 'cleanup_pending',
    });
    expect(repository.finalize).not.toHaveBeenCalled();

    await expect(coordinator.resumePending()).resolves.toEqual({ deleted, status: 'completed' });
  });

  it('keeps an unexpected cleanup or finalize failure retryable without returning its details', async () => {
    const coordinator = new LocalDataDeletionCoordinator({ attachments, repository });
    attachments.cleanupPending.mockRejectedValueOnce(new Error('private cleanup failure'));

    await expect(coordinator.resumePending()).resolves.toEqual({
      attachmentCleanupFailures: null,
      status: 'cleanup_pending',
    });
    vi.mocked(repository.finalize).mockRejectedValueOnce(new Error('private database failure'));
    await expect(coordinator.resumePending()).resolves.toEqual({
      attachmentCleanupFailures: null,
      status: 'cleanup_pending',
    });
  });

  it('does nothing when no durable deletion intent exists', async () => {
    vi.mocked(repository.getPending).mockResolvedValue(null);

    await expect(
      new LocalDataDeletionCoordinator({ attachments, repository }).resumePending(),
    ).resolves.toBeNull();
    expect(attachments.cleanupPending).not.toHaveBeenCalled();
    expect(repository.finalize).not.toHaveBeenCalled();
  });
});
