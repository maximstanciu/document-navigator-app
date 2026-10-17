import type { SQLiteDatabase } from 'expo-sqlite';

export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

/** The subset of SQLite every repository needs. Implemented by expo-sqlite in the app and node:sqlite in tests. */
export type SqlExecutor = {
  /** Static, trusted SQL only (DDL, pragmas): no parameter binding. */
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params?: SqlParams): Promise<{ changes: number }>;
  getAllAsync<T>(sql: string, params?: SqlParams): Promise<T[]>;
  getFirstAsync<T>(sql: string, params?: SqlParams): Promise<T | null>;
};

export type SqlDatabase = SqlExecutor & {
  /** Runs `work` in one transaction; every query inside must go through `tx`. Rolls back if it throws. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
};

/**
 * Runs tasks one at a time. expo-sqlite's `withTransactionAsync` pulls any query that runs meanwhile
 * into the transaction, and `withExclusiveTransactionAsync` opens a second connection that can fail
 * with "database is locked" (and doesn't exist on web). Serializing all access avoids both.
 */
export function createSerialQueue() {
  let tail: Promise<unknown> = Promise.resolve();
  return function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** Wraps an executor so that every call and every transaction runs through one serial queue. */
export function createSerialDatabase(
  executor: SqlExecutor,
  runInTransaction: <T>(work: () => Promise<T>) => Promise<T>
): SqlDatabase {
  const enqueue = createSerialQueue();
  return {
    execAsync: (sql) => enqueue(() => executor.execAsync(sql)),
    runAsync: (sql, params) => enqueue(() => executor.runAsync(sql, params)),
    getAllAsync: (sql, params) => enqueue(() => executor.getAllAsync(sql, params)),
    getFirstAsync: (sql, params) => enqueue(() => executor.getFirstAsync(sql, params)),
    transaction: (work) => enqueue(() => runInTransaction(() => work(executor))),
  };
}

export function fromExpoDatabase(db: SQLiteDatabase): SqlDatabase {
  const executor: SqlExecutor = {
    execAsync: (sql) => db.execAsync(sql),
    runAsync: async (sql, params = []) => {
      const result = await db.runAsync(sql, [...params]);
      return { changes: result.changes };
    },
    getAllAsync: (sql, params = []) => db.getAllAsync(sql, [...params]),
    getFirstAsync: (sql, params = []) => db.getFirstAsync(sql, [...params]),
  };
  async function runInTransaction<T>(work: () => Promise<T>): Promise<T> {
    let result: { value: T } | undefined;
    await db.withTransactionAsync(async () => {
      result = { value: await work() };
    });
    if (!result) throw new Error('Transaction finished without a result');
    return result.value;
  }
  return createSerialDatabase(executor, runInTransaction);
}
