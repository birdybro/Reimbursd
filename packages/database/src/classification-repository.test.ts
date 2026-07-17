// SPDX-License-Identifier: GPL-3.0-only
import { randomUUID } from 'node:crypto';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createCategory, createManualReceipt, createTag } from '@reimbursd/domain';
import { afterEach, describe, expect, it } from 'vitest';

import {
  ClassificationConflictError,
  ClassificationDuplicateNameError,
  ClassificationInUseError,
  ClassificationNotFoundError,
  SqliteCategoryRepository,
  SqliteReceiptClassificationRepository,
  SqliteTagRepository,
} from './classification-repository.js';
import { ReceiptConflictError, SqliteReceiptRepository } from './receipt-repository.js';
import {
  migrateDatabase,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from './sqlite.js';

const timestamp = '2026-07-17T14:00:00-06:00';
const temporaryDatabases: string[] = [];

afterEach(() => {
  for (const path of temporaryDatabases.splice(0)) {
    rmSync(path, { force: true });
  }
});

describe('SQLite category and tag repositories', () => {
  it('upgrades a populated receipt database without rewriting existing rows', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = await receipts.create(
      createManualReceipt({
        capturedAt: timestamp,
        currencyCode: 'USD',
        id: randomUUID(),
        merchantId: randomUUID(),
        merchantName: 'Existing Market',
        purchasedAt: timestamp,
        subtotalMinor: 1_000,
        taxMinor: 0,
        tipMinor: 0,
        totalMinor: 1_000,
      }),
    );
    await connection.exec(`
      DROP TABLE receipt_tags;
      DROP TABLE tags;
      DROP TABLE categories;
      DELETE FROM schema_migrations WHERE version = 6;
    `);

    await migrateDatabase(connection);

    await expect(receipts.getById(receipt.id)).resolves.toEqual(receipt);
    await expect(new SqliteCategoryRepository(connection).list()).resolves.toEqual([]);
    await expect(new SqliteTagRepository(connection).list()).resolves.toEqual([]);
    connection.close();
  });

  it('persists categories and tags across database reopening', async () => {
    const path = createTemporaryDatabasePath();
    const firstConnection = new NodeSqliteConnection(path);
    await migrateDatabase(firstConnection);
    const category = createCategory({
      createdAt: timestamp,
      id: randomUUID(),
      name: 'Client Meals',
    });
    const tag = createTag({ createdAt: timestamp, id: randomUUID(), name: 'Reimbursable' });
    await new SqliteCategoryRepository(firstConnection).create(category);
    await new SqliteTagRepository(firstConnection).create(tag);
    firstConnection.close();

    const reopenedConnection = new NodeSqliteConnection(path);
    await migrateDatabase(reopenedConnection);
    await expect(new SqliteCategoryRepository(reopenedConnection).list()).resolves.toEqual([
      category,
    ]);
    await expect(new SqliteTagRepository(reopenedConnection).list()).resolves.toEqual([tag]);
    reopenedConnection.close();
  });

  it('enforces normalized name uniqueness', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const categories = new SqliteCategoryRepository(connection);
    await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Client Meals' }),
    );

    await expect(
      categories.create(
        createCategory({ createdAt: timestamp, id: randomUUID(), name: ' client   MEALS ' }),
      ),
    ).rejects.toBeInstanceOf(ClassificationDuplicateNameError);
    connection.close();
  });

  it('uses optimistic versions for renames', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const tags = new SqliteTagRepository(connection);
    const tag = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Needs review' }),
    );
    const update = {
      expectedVersion: tag.version,
      id: tag.id,
      name: 'Reviewed',
      updatedAt: '2026-07-17T14:05:00-06:00',
    };

    await expect(tags.update(update)).resolves.toMatchObject({ name: 'Reviewed', version: 2 });
    await expect(tags.update(update)).rejects.toBeInstanceOf(ClassificationConflictError);
    connection.close();
  });

  it('keeps tombstones while hiding deleted classifications', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const categories = new SqliteCategoryRepository(connection);
    const category = await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Travel' }),
    );
    const deletedAt = '2026-07-17T14:05:00-06:00';

    await expect(
      categories.delete(category.id, category.version, deletedAt),
    ).resolves.toMatchObject({ deletedAt, version: 2 });
    await expect(categories.getById(category.id)).resolves.toBeNull();
    await expect(categories.list()).resolves.toEqual([]);
    await expect(
      categories.create(createCategory({ createdAt: deletedAt, id: randomUUID(), name: 'travel' })),
    ).rejects.toBeInstanceOf(ClassificationDuplicateNameError);
    connection.close();
  });

  it('refuses to delete classifications assigned to active receipts', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipt = await new SqliteReceiptRepository(connection).create(
      createManualReceipt({
        capturedAt: timestamp,
        currencyCode: 'USD',
        id: randomUUID(),
        merchantId: randomUUID(),
        merchantName: 'Synthetic Market',
        purchasedAt: timestamp,
        subtotalMinor: 1_000,
        taxMinor: 0,
        tipMinor: 0,
        totalMinor: 1_000,
      }),
    );
    const categories = new SqliteCategoryRepository(connection);
    const tags = new SqliteTagRepository(connection);
    const category = await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Supplies' }),
    );
    const tag = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Reimbursable' }),
    );
    await connection.run('UPDATE receipts SET category_id = ? WHERE id = ?;', [
      category.id,
      receipt.id,
    ]);
    await connection.run(
      `INSERT INTO receipt_tags (
         receipt_id, tag_id, assigned_at, updated_at, version, deleted_at
       ) VALUES (?, ?, ?, ?, 1, NULL);`,
      [receipt.id, tag.id, timestamp, timestamp],
    );

    await expect(categories.delete(category.id, 1, timestamp)).rejects.toBeInstanceOf(
      ClassificationInUseError,
    );
    await expect(tags.delete(tag.id, 1, timestamp)).rejects.toBeInstanceOf(
      ClassificationInUseError,
    );
    connection.close();
  });

  it('atomically assigns a category and complete tag set to a versioned receipt', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = await receipts.create(makeReceipt());
    const categories = new SqliteCategoryRepository(connection);
    const tags = new SqliteTagRepository(connection);
    const category = await categories.create(
      createCategory({ createdAt: timestamp, id: randomUUID(), name: 'Meals' }),
    );
    const reimbursable = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Reimbursable' }),
    );
    const client = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Client' }),
    );
    const repository = new SqliteReceiptClassificationRepository(connection);
    const updatedAt = '2026-07-17T14:05:00-06:00';

    const classification = await repository.update({
      categoryId: category.id,
      expectedVersion: receipt.version,
      receiptId: receipt.id,
      tagIds: [reimbursable.id, client.id],
      updatedAt,
    });

    expect(classification).toMatchObject({
      category,
      receipt: { categoryId: category.id, updatedAt, version: 2 },
      tags: [client, reimbursable],
    });
    await expect(repository.getByReceiptId(receipt.id)).resolves.toEqual(classification);
    connection.close();
  });

  it('tombstones removed tag assignments and can revive them deterministically', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipt = await new SqliteReceiptRepository(connection).create(makeReceipt());
    const tags = new SqliteTagRepository(connection);
    const firstTag = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'First' }),
    );
    const secondTag = await tags.create(
      createTag({ createdAt: timestamp, id: randomUUID(), name: 'Second' }),
    );
    const repository = new SqliteReceiptClassificationRepository(connection);
    const first = await repository.update({
      categoryId: null,
      expectedVersion: 1,
      receiptId: receipt.id,
      tagIds: [firstTag.id],
      updatedAt: '2026-07-17T14:05:00-06:00',
    });
    const second = await repository.update({
      categoryId: null,
      expectedVersion: first.receipt.version,
      receiptId: receipt.id,
      tagIds: [secondTag.id],
      updatedAt: '2026-07-17T14:06:00-06:00',
    });
    const revived = await repository.update({
      categoryId: null,
      expectedVersion: second.receipt.version,
      receiptId: receipt.id,
      tagIds: [firstTag.id],
      updatedAt: '2026-07-17T14:07:00-06:00',
    });

    expect(revived.tags).toEqual([firstTag]);
    const rows = await connection.getAll<{
      deleted_at: string | null;
      tag_id: string;
      version: number;
    }>(
      'SELECT tag_id, version, deleted_at FROM receipt_tags WHERE receipt_id = ? ORDER BY tag_id;',
      [receipt.id],
    );
    expect(rows).toEqual(
      expect.arrayContaining([
        { deleted_at: null, tag_id: firstTag.id, version: 3 },
        { deleted_at: '2026-07-17T14:07:00-06:00', tag_id: secondTag.id, version: 2 },
      ]),
    );
    connection.close();
  });

  it('rejects missing assignments and stale receipt versions without partial changes', async () => {
    const connection = new NodeSqliteConnection(':memory:');
    await migrateDatabase(connection);
    const receipts = new SqliteReceiptRepository(connection);
    const receipt = await receipts.create(makeReceipt());
    const repository = new SqliteReceiptClassificationRepository(connection);

    await expect(
      repository.update({
        categoryId: randomUUID(),
        expectedVersion: receipt.version,
        receiptId: receipt.id,
        tagIds: [],
        updatedAt: '2026-07-17T14:05:00-06:00',
      }),
    ).rejects.toBeInstanceOf(ClassificationNotFoundError);
    await expect(receipts.getById(receipt.id)).resolves.toEqual(receipt);

    await expect(
      repository.update({
        categoryId: null,
        expectedVersion: receipt.version + 1,
        receiptId: receipt.id,
        tagIds: [],
        updatedAt: '2026-07-17T14:05:00-06:00',
      }),
    ).rejects.toBeInstanceOf(ReceiptConflictError);
    await expect(receipts.getById(receipt.id)).resolves.toEqual(receipt);
    connection.close();
  });
});

class NodeSqliteConnection implements SqliteConnection {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = new DatabaseSync(path);
  }

  close(): void {
    this.#database.close();
  }

  async exec(sql: string): Promise<void> {
    this.#database.exec(sql);
  }

  async getAll<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...toNodeValues(parameters)) as Row[];
  }

  async getFirst<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<Row | null> {
    const row = this.#database.prepare(sql).get(...toNodeValues(parameters));
    return row === undefined ? null : (row as Row);
  }

  async run(sql: string, parameters: readonly SqliteValue[] = []): Promise<SqliteRunResult> {
    const result = this.#database.prepare(sql).run(...toNodeValues(parameters));
    return { changes: Number(result.changes), lastInsertRowId: Number(result.lastInsertRowid) };
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.#database.exec('BEGIN IMMEDIATE;');

    try {
      const result = await operation();
      this.#database.exec('COMMIT;');
      return result;
    } catch (error) {
      this.#database.exec('ROLLBACK;');
      throw error;
    }
  }
}

function createTemporaryDatabasePath(): string {
  const path = join(tmpdir(), `reimbursd-classification-${randomUUID()}.sqlite`);
  temporaryDatabases.push(path);
  return path;
}

function makeReceipt() {
  return createManualReceipt({
    capturedAt: timestamp,
    currencyCode: 'USD',
    id: randomUUID(),
    merchantId: randomUUID(),
    merchantName: 'Synthetic Market',
    purchasedAt: timestamp,
    subtotalMinor: 1_000,
    taxMinor: 0,
    tipMinor: 0,
    totalMinor: 1_000,
  });
}

function toNodeValues(values: readonly SqliteValue[]): SQLInputValue[] {
  return [...values];
}
