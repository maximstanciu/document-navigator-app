import { openDatabaseAsync } from 'expo-sqlite';

import { fromExpoDatabase, type SqlDatabase } from './database';
import { migrate } from './migrations';
import { createRepositories, purgeTombstones, setRepositories } from './repositories';

const DATABASE_NAME = 'docnavigator.db';
const TOMBSTONE_RETENTION_DAYS = 30;

/**
 * Opens the app database, migrates it and makes the repositories available through
 * `getRepositories()`. Runs once at startup while the splash screen is still up (STO-5).
 */
export async function openAppDatabase(): Promise<SqlDatabase> {
  const db = fromExpoDatabase(await openDatabaseAsync(DATABASE_NAME));
  // Connection settings, outside any transaction. WAL is a no-op where unsupported.
  await db.execAsync('PRAGMA journal_mode = WAL');
  await db.execAsync('PRAGMA foreign_keys = ON');
  await migrate(db);
  await purgeTombstones(db, new Date(Date.now() - TOMBSTONE_RETENTION_DAYS * 24 * 60 * 60 * 1000));
  setRepositories(createRepositories(db));
  return db;
}
