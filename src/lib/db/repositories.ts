import { createActionsRepository } from './actions-repository';
import type { SqlDatabase } from './database';
import { createDeadlinesRepository } from './deadlines-repository';
import { createDocumentsRepository } from './documents-repository';
import { createPagesRepository } from './pages-repository';
import { createScheduledNotificationsRepository } from './scheduled-notifications-repository';
import { createSettingsRepository } from './settings-repository';
import { systemClock, type Clock } from './sql';

export function createRepositories(db: SqlDatabase, now: Clock = systemClock) {
  return {
    documents: createDocumentsRepository(db, now),
    pages: createPagesRepository(db),
    deadlines: createDeadlinesRepository(db, now),
    actions: createActionsRepository(db, now),
    scheduledNotifications: createScheduledNotificationsRepository(db),
    settings: createSettingsRepository(db),
    /** «Delete all data» (STO-7, SET-3): see `wipeAllData()`. */
    wipeAll: () => wipeAllData(db),
  };
}

export type Repositories = ReturnType<typeof createRepositories>;

let active: Repositories | null = null;

/** Called once the database is open and migrated (app startup), or by tests with an in-memory database. */
export function setRepositories(repositories: Repositories | null) {
  active = repositories;
}

/** The repositories of the open database. Feature `api.ts` files read and write data only through these. */
export function getRepositories(): Repositories {
  if (!active) throw new Error('The database is not open yet');
  return active;
}

/**
 * Physically deletes tombstones older than `cutoff` (STO-6 keeps them 30 days for future sync).
 * Child rows of a purged document go with it through `ON DELETE CASCADE`.
 */
export async function purgeTombstones(db: SqlDatabase, cutoff: Date): Promise<void> {
  const before = cutoff.toISOString();
  await db.transaction(async (tx) => {
    await tx.runAsync('DELETE FROM actions WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
      before,
    ]);
    await tx.runAsync('DELETE FROM deadlines WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
      before,
    ]);
    await tx.runAsync('DELETE FROM documents WHERE deleted_at IS NOT NULL AND deleted_at < ?', [
      before,
    ]);
  });
}

/** Children first, though `DELETE` of a parent would cascade anyway. */
const ALL_TABLES = [
  'scheduled_notifications',
  'actions',
  'deadlines',
  'pages',
  'documents',
  'settings',
] as const;

/**
 * «Delete all data» (STO-7, SET-3): every row of every table, tombstones and settings included, as
 * on a fresh install; nothing is kept for sync. `VACUUM` then rebuilds the file without the freed
 * pages and the checkpoint empties the WAL, so the deleted content can't be read from either (or
 * from a backup taken later). Page files and the reminders in the OS are the caller's.
 */
export async function wipeAllData(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    for (const table of ALL_TABLES) await tx.runAsync(`DELETE FROM ${table}`);
  });
  await db.execAsync('VACUUM');
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE)');
}
