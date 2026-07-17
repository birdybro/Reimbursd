// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidCategory,
  assertValidTag,
  isUuid,
  normalizeClassificationName,
  validateReceipt,
  type Category,
  type Receipt,
  type Tag,
} from '@reimbursd/domain';

import {
  ReceiptConflictError,
  ReceiptNotFoundError,
  SqliteReceiptRepository,
} from './receipt-repository.js';
import type { SqliteConnection, SqliteValue } from './sqlite.js';

export interface UpdateClassificationInput {
  readonly expectedVersion: number;
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}

interface NamedClassificationRepository<Record> {
  create(record: Record): Promise<Record>;
  delete(id: string, expectedVersion: number, deletedAt: string): Promise<Record>;
  getById(id: string): Promise<Record | null>;
  list(): Promise<readonly Record[]>;
  update(input: UpdateClassificationInput): Promise<Record>;
}

export type CategoryRepository = NamedClassificationRepository<Category>;

export type TagRepository = NamedClassificationRepository<Tag>;

export interface ReceiptClassification {
  readonly category: Category | null;
  readonly receipt: Receipt;
  readonly tags: readonly Tag[];
}

export interface UpdateReceiptClassificationInput {
  readonly categoryId: string | null;
  readonly expectedVersion: number;
  readonly receiptId: string;
  readonly tagIds: readonly string[];
  readonly updatedAt: string;
}

export interface ReceiptClassificationRepository {
  getByReceiptId(receiptId: string): Promise<ReceiptClassification>;
  update(input: UpdateReceiptClassificationInput): Promise<ReceiptClassification>;
}

export class ClassificationNotFoundError extends Error {
  constructor() {
    super('Category or tag was not found.');
    this.name = 'ClassificationNotFoundError';
  }
}

export class ClassificationConflictError extends Error {
  constructor() {
    super('Category or tag changed since it was opened. Reload it before saving.');
    this.name = 'ClassificationConflictError';
  }
}

export class ClassificationDuplicateNameError extends Error {
  constructor() {
    super('A category or tag with that name already exists.');
    this.name = 'ClassificationDuplicateNameError';
  }
}

export class ClassificationInUseError extends Error {
  constructor() {
    super('Assigned categories and tags must be unassigned before deletion.');
    this.name = 'ClassificationInUseError';
  }
}

interface ClassificationRow {
  created_at: string;
  deleted_at: string | null;
  id: string;
  name: string;
  normalized_name: string;
  updated_at: string;
  version: number;
}

interface ReceiptTagRow {
  deleted_at: string | null;
  tag_id: string;
  version: number;
}

type ClassificationTable = 'categories' | 'tags';

class SqliteNamedClassificationRepository<
  Record extends Category,
> implements NamedClassificationRepository<Record> {
  readonly #assertValid: (record: Record) => void;
  readonly #connection: SqliteConnection;
  readonly #table: ClassificationTable;

  constructor(
    connection: SqliteConnection,
    table: ClassificationTable,
    assertValid: (record: Record) => void,
  ) {
    this.#assertValid = assertValid;
    this.#connection = connection;
    this.#table = table;
  }

  async create(record: Record): Promise<Record> {
    this.#assertValid(record);

    return this.#connection.transaction(async () => {
      await this.#assertNameAvailable(record.normalizedName);
      await this.#connection.run(
        `INSERT INTO ${this.#table} (
           id, name, normalized_name, created_at, updated_at, version, deleted_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
        classificationParameters(record),
      );
      return record;
    });
  }

  async delete(id: string, expectedVersion: number, deletedAt: string): Promise<Record> {
    return this.#connection.transaction(async () => {
      const existing = await this.#requireActive(id);
      assertExpectedVersion(existing, expectedVersion);
      await this.#assertNotInUse(id);
      const deleted = {
        ...existing,
        deletedAt,
        updatedAt: deletedAt,
        version: existing.version + 1,
      };
      this.#assertValid(deleted);
      const result = await this.#connection.run(
        `UPDATE ${this.#table}
         SET deleted_at = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND deleted_at IS NULL;`,
        [deletedAt, deletedAt, id, expectedVersion],
      );

      if (result.changes !== 1) {
        throw new ClassificationConflictError();
      }

      return deleted;
    });
  }

  async getById(id: string): Promise<Record | null> {
    const row = await this.#connection.getFirst<ClassificationRow>(
      `SELECT id, name, normalized_name, created_at, updated_at, version, deleted_at
       FROM ${this.#table} WHERE id = ? AND deleted_at IS NULL;`,
      [id],
    );
    return row === null ? null : this.#mapRow(row);
  }

  async list(): Promise<readonly Record[]> {
    const rows = await this.#connection.getAll<ClassificationRow>(
      `SELECT id, name, normalized_name, created_at, updated_at, version, deleted_at
       FROM ${this.#table}
       WHERE deleted_at IS NULL
       ORDER BY normalized_name, id;`,
    );
    return rows.map((row) => this.#mapRow(row));
  }

  async update(input: UpdateClassificationInput): Promise<Record> {
    return this.#connection.transaction(async () => {
      const existing = await this.#requireActive(input.id);
      assertExpectedVersion(existing, input.expectedVersion);
      const name = input.name.trim().replace(/\s+/g, ' ');
      const updated = {
        ...existing,
        name,
        normalizedName: normalizeClassificationName(name),
        updatedAt: input.updatedAt,
        version: existing.version + 1,
      };
      this.#assertValid(updated);
      await this.#assertNameAvailable(updated.normalizedName, updated.id);
      const result = await this.#connection.run(
        `UPDATE ${this.#table}
         SET name = ?, normalized_name = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND deleted_at IS NULL;`,
        [
          updated.name,
          updated.normalizedName,
          updated.updatedAt,
          updated.id,
          input.expectedVersion,
        ],
      );

      if (result.changes !== 1) {
        throw new ClassificationConflictError();
      }

      return updated;
    });
  }

  async #assertNameAvailable(normalizedName: string, excludedId?: string): Promise<void> {
    const duplicate = await this.#connection.getFirst<{ id: string }>(
      excludedId === undefined
        ? `SELECT id FROM ${this.#table} WHERE normalized_name = ?;`
        : `SELECT id FROM ${this.#table} WHERE normalized_name = ? AND id != ?;`,
      excludedId === undefined ? [normalizedName] : [normalizedName, excludedId],
    );

    if (duplicate !== null) {
      throw new ClassificationDuplicateNameError();
    }
  }

  async #assertNotInUse(id: string): Promise<void> {
    const assignment =
      this.#table === 'categories'
        ? await this.#connection.getFirst<{ id: string }>(
            `SELECT id FROM receipts
             WHERE category_id = ? AND deleted_at IS NULL LIMIT 1;`,
            [id],
          )
        : await this.#connection.getFirst<{ id: string }>(
            `SELECT rt.receipt_id AS id
             FROM receipt_tags rt
             INNER JOIN receipts r ON r.id = rt.receipt_id
             WHERE rt.tag_id = ? AND rt.deleted_at IS NULL AND r.deleted_at IS NULL
             LIMIT 1;`,
            [id],
          );

    if (assignment !== null) {
      throw new ClassificationInUseError();
    }
  }

  async #requireActive(id: string): Promise<Record> {
    const record = await this.getById(id);

    if (record === null) {
      throw new ClassificationNotFoundError();
    }

    return record;
  }

  #mapRow(row: ClassificationRow): Record {
    const record = {
      createdAt: row.created_at,
      deletedAt: row.deleted_at,
      id: row.id,
      name: row.name,
      normalizedName: row.normalized_name,
      updatedAt: row.updated_at,
      version: row.version,
    } as Record;
    this.#assertValid(record);
    return record;
  }
}

export class SqliteCategoryRepository
  extends SqliteNamedClassificationRepository<Category>
  implements CategoryRepository
{
  constructor(connection: SqliteConnection) {
    super(connection, 'categories', assertValidCategory);
  }
}

export class SqliteTagRepository
  extends SqliteNamedClassificationRepository<Tag>
  implements TagRepository
{
  constructor(connection: SqliteConnection) {
    super(connection, 'tags', assertValidTag);
  }
}

export class SqliteReceiptClassificationRepository implements ReceiptClassificationRepository {
  readonly #connection: SqliteConnection;

  constructor(connection: SqliteConnection) {
    this.#connection = connection;
  }

  async getByReceiptId(receiptId: string): Promise<ReceiptClassification> {
    const receipt = await new SqliteReceiptRepository(this.#connection).getById(receiptId);

    if (receipt === null) {
      throw new ReceiptNotFoundError();
    }

    return {
      category: await this.#loadCategory(receipt.categoryId),
      receipt,
      tags: await this.#listReceiptTags(receipt.id),
    };
  }

  async update(input: UpdateReceiptClassificationInput): Promise<ReceiptClassification> {
    validateAssignmentInput(input);

    return this.#connection.transaction(async () => {
      const receipt = await new SqliteReceiptRepository(this.#connection).getById(input.receiptId);

      if (receipt === null) {
        throw new ReceiptNotFoundError();
      }

      if (receipt.version !== input.expectedVersion) {
        throw new ReceiptConflictError();
      }

      const category = await this.#loadCategory(input.categoryId);
      const tags = await this.#loadTags(input.tagIds);
      const updatedReceipt: Receipt = {
        ...receipt,
        categoryId: input.categoryId,
        updatedAt: input.updatedAt,
        version: receipt.version + 1,
      };
      const receiptIssues = validateReceipt(updatedReceipt);

      if (receiptIssues.length > 0) {
        throw new TypeError('Receipt classification update is invalid.');
      }

      const receiptResult = await this.#connection.run(
        `UPDATE receipts
         SET category_id = ?, updated_at = ?, version = version + 1
         WHERE id = ? AND version = ? AND deleted_at IS NULL;`,
        [input.categoryId, input.updatedAt, input.receiptId, input.expectedVersion],
      );

      if (receiptResult.changes !== 1) {
        throw new ReceiptConflictError();
      }

      await this.#replaceTags(input);
      return { category, receipt: updatedReceipt, tags };
    });
  }

  async #listReceiptTags(receiptId: string): Promise<readonly Tag[]> {
    const rows = await this.#connection.getAll<ClassificationRow>(
      `SELECT t.id, t.name, t.normalized_name, t.created_at, t.updated_at, t.version, t.deleted_at
       FROM receipt_tags rt
       INNER JOIN tags t ON t.id = rt.tag_id
       WHERE rt.receipt_id = ? AND rt.deleted_at IS NULL AND t.deleted_at IS NULL
       ORDER BY t.normalized_name, t.id;`,
      [receiptId],
    );
    return rows.map(mapTagRow);
  }

  async #loadCategory(categoryId: string | null): Promise<Category | null> {
    if (categoryId === null) {
      return null;
    }

    const category = await new SqliteCategoryRepository(this.#connection).getById(categoryId);

    if (category === null) {
      throw new ClassificationNotFoundError();
    }

    return category;
  }

  async #loadTags(tagIds: readonly string[]): Promise<readonly Tag[]> {
    const repository = new SqliteTagRepository(this.#connection);
    const tags: Tag[] = [];

    for (const tagId of tagIds) {
      const tag = await repository.getById(tagId);

      if (tag === null) {
        throw new ClassificationNotFoundError();
      }

      tags.push(tag);
    }

    return tags.sort((left, right) =>
      left.normalizedName === right.normalizedName
        ? left.id.localeCompare(right.id)
        : left.normalizedName.localeCompare(right.normalizedName),
    );
  }

  async #replaceTags(input: UpdateReceiptClassificationInput): Promise<void> {
    const rows = await this.#connection.getAll<ReceiptTagRow>(
      `SELECT tag_id, version, deleted_at FROM receipt_tags WHERE receipt_id = ?;`,
      [input.receiptId],
    );
    const byTagId = new Map(rows.map((row) => [row.tag_id, row]));
    const desiredTagIds = new Set(input.tagIds);

    for (const row of rows) {
      if (row.deleted_at !== null || desiredTagIds.has(row.tag_id)) {
        continue;
      }

      const result = await this.#connection.run(
        `UPDATE receipt_tags
         SET deleted_at = ?, updated_at = ?, version = version + 1
         WHERE receipt_id = ? AND tag_id = ? AND version = ? AND deleted_at IS NULL;`,
        [input.updatedAt, input.updatedAt, input.receiptId, row.tag_id, row.version],
      );

      if (result.changes !== 1) {
        throw new ReceiptConflictError();
      }
    }

    for (const tagId of input.tagIds) {
      const existing = byTagId.get(tagId);

      if (existing?.deleted_at === null) {
        continue;
      }

      if (existing === undefined) {
        await this.#connection.run(
          `INSERT INTO receipt_tags (
             receipt_id, tag_id, assigned_at, updated_at, version, deleted_at
           ) VALUES (?, ?, ?, ?, 1, NULL);`,
          [input.receiptId, tagId, input.updatedAt, input.updatedAt],
        );
        continue;
      }

      const result = await this.#connection.run(
        `UPDATE receipt_tags
         SET assigned_at = ?, updated_at = ?, deleted_at = NULL, version = version + 1
         WHERE receipt_id = ? AND tag_id = ? AND version = ? AND deleted_at IS NOT NULL;`,
        [input.updatedAt, input.updatedAt, input.receiptId, tagId, existing.version],
      );

      if (result.changes !== 1) {
        throw new ReceiptConflictError();
      }
    }
  }
}

function assertExpectedVersion(record: Category, expectedVersion: number): void {
  if (record.version !== expectedVersion) {
    throw new ClassificationConflictError();
  }
}

function classificationParameters(record: Category): readonly SqliteValue[] {
  return [
    record.id,
    record.name,
    record.normalizedName,
    record.createdAt,
    record.updatedAt,
    record.version,
    record.deletedAt,
  ];
}

function validateAssignmentInput(input: UpdateReceiptClassificationInput): void {
  if (
    !isUuid(input.receiptId) ||
    (input.categoryId !== null && !isUuid(input.categoryId)) ||
    input.tagIds.length > 50 ||
    input.tagIds.some((tagId) => !isUuid(tagId)) ||
    new Set(input.tagIds).size !== input.tagIds.length
  ) {
    throw new TypeError('Receipt classification identifiers must be valid and unique.');
  }
}

function mapTagRow(row: ClassificationRow): Tag {
  const tag: Tag = {
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    id: row.id,
    name: row.name,
    normalizedName: row.normalized_name,
    updatedAt: row.updated_at,
    version: row.version,
  };
  assertValidTag(tag);
  return tag;
}
