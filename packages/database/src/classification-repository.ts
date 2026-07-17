// SPDX-License-Identifier: GPL-3.0-only
import {
  assertValidCategory,
  assertValidTag,
  normalizeClassificationName,
  type Category,
  type Tag,
} from '@reimbursd/domain';

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
