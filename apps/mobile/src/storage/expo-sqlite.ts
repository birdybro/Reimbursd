// SPDX-License-Identifier: GPL-3.0-only
import {
  migrateDatabase,
  SqliteFieldEvidenceRepository,
  SqliteProcessingHistoryRepository,
  SqliteReceiptDocumentRepository,
  SqliteReceiptRepository,
  type FieldEvidenceRepository,
  type ProcessingHistoryRepository,
  type ReceiptDocumentRepository,
  type ReceiptRepository,
  type SqliteConnection,
  type SqliteRunResult,
  type SqliteValue,
} from '@reimbursd/database';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const databaseName = 'reimbursd.db';

export interface LocalRepositories {
  readonly documents: ReceiptDocumentRepository;
  readonly evidence: FieldEvidenceRepository;
  readonly processingHistory: ProcessingHistoryRepository;
  readonly receipts: ReceiptRepository;
}

let repositoryPromise: Promise<LocalRepositories> | undefined;

export function getLocalReceiptRepository(): Promise<ReceiptRepository> {
  return getLocalRepositories().then(({ receipts }) => receipts);
}

export function getLocalRepositories(): Promise<LocalRepositories> {
  repositoryPromise ??= initializeRepositories().catch((error: unknown) => {
    repositoryPromise = undefined;
    throw error;
  });
  return repositoryPromise;
}

async function initializeRepositories(): Promise<LocalRepositories> {
  const database = await openDatabaseAsync(databaseName);
  const connection = new ExpoSqliteConnection(database);
  await connection.exec('PRAGMA journal_mode = WAL;');
  await migrateDatabase(connection);
  return {
    documents: new SqliteReceiptDocumentRepository(connection),
    evidence: new SqliteFieldEvidenceRepository(connection),
    processingHistory: new SqliteProcessingHistoryRepository(connection),
    receipts: new SqliteReceiptRepository(connection),
  };
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
