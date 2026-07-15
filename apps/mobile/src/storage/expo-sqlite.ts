// SPDX-License-Identifier: GPL-3.0-only
import {
  migrateDatabase,
  SqliteReceiptRepository,
  type ReceiptRepository,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from '@reimbursd/database';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const databaseName = 'reimbursd.db';

let repositoryPromise: Promise<ReceiptRepository> | undefined;

export function getLocalReceiptRepository(): Promise<ReceiptRepository> {
  repositoryPromise ??= initializeRepository().catch((error: unknown) => {
    repositoryPromise = undefined;
    throw error;
  });
  return repositoryPromise;
}

async function initializeRepository(): Promise<ReceiptRepository> {
  const database = await openDatabaseAsync(databaseName);
  const connection = new ExpoSqliteConnection(database);
  await connection.exec('PRAGMA journal_mode = WAL;');
  await migrateDatabase(connection);
  return new SqliteReceiptRepository(connection);
}

class ExpoSqliteConnection implements SqliteConnection {
  readonly #database: SQLiteDatabase;

  constructor(database: SQLiteDatabase) {
    this.#database = database;
  }

  async exec(sql: string): Promise<void> {
    await this.#database.execAsync(sql);
  }

  async getAll<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<readonly Row[]> {
    return this.#database.getAllAsync<Row>(sql, [...parameters]);
  }

  async getFirst<Row>(sql: string, parameters: readonly SqliteValue[] = []): Promise<Row | null> {
    return this.#database.getFirstAsync<Row>(sql, [...parameters]);
  }

  async run(sql: string, parameters: readonly SqliteValue[] = []): Promise<SqliteRunResult> {
    const result = await this.#database.runAsync(sql, [...parameters]);
    return { changes: result.changes, lastInsertRowId: result.lastInsertRowId };
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    const outcome: { value?: Result } = {};

    await this.#database.withTransactionAsync(async () => {
      outcome.value = await operation();
    });

    return outcome.value as Result;
  }
}
