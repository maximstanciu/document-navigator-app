/// <reference types="node" />
// Test-only: real SQLite in memory through Node's built-in node:sqlite, so repositories, migrations
// and LIKE semantics are tested against SQLite itself. Never import this from app code.
import { DatabaseSync } from 'node:sqlite';

import {
  createSerialDatabase,
  type SqlDatabase,
  type SqlExecutor,
  type SqlParams,
} from '@/lib/db/database';
import { migrate } from '@/lib/db/migrations';
import { createRepositories, setRepositories, type Repositories } from '@/lib/db/repositories';
import type { Clock } from '@/lib/db/sql';

export function createNodeDatabase(): SqlDatabase {
  const db = new DatabaseSync(':memory:');
  const executor: SqlExecutor = {
    execAsync: async (sql) => {
      db.exec(sql);
    },
    runAsync: async (sql, params: SqlParams = []) => {
      const result = db.prepare(sql).run(...params);
      return { changes: Number(result.changes) };
    },
    getAllAsync: async <T>(sql: string, params: SqlParams = []) =>
      db.prepare(sql).all(...params) as T[],
    getFirstAsync: async <T>(sql: string, params: SqlParams = []) =>
      (db.prepare(sql).get(...params) ?? null) as T | null,
  };
  return createSerialDatabase(executor, async (work) => {
    db.exec('BEGIN');
    try {
      const result = await work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  });
}

/** A migrated in-memory database with foreign keys on, like the app's. */
export async function createTestDatabase(): Promise<SqlDatabase> {
  const db = createNodeDatabase();
  await db.execAsync('PRAGMA foreign_keys = ON');
  await migrate(db);
  return db;
}

/** A clock that only moves when the test says so. */
export function createFakeClock(start = '2026-10-17T09:00:00.000Z') {
  let current = new Date(start).getTime();
  const now: Clock = () => new Date(current);
  return {
    now,
    advance(milliseconds: number) {
      current += milliseconds;
    },
  };
}

/**
 * Fresh database + repositories, installed as the app's active repositories so feature code that
 * calls `getRepositories()` sees them. Call `setRepositories(null)` in `afterEach`.
 */
export async function installTestRepositories(
  now: Clock = createFakeClock().now
): Promise<{ db: SqlDatabase; repositories: Repositories }> {
  const db = await createTestDatabase();
  const repositories = createRepositories(db, now);
  setRepositories(repositories);
  return { db, repositories };
}
