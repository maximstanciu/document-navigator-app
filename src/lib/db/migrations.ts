import type { SqlDatabase } from './database';

export type Migration = { version: number; statements: readonly string[] };

/**
 * Append-only: never edit a migration that has shipped; add a new one with the next version.
 * The schema version lives in `PRAGMA user_version` (STO-5).
 */
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE documents (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        document_type TEXT,
        sender_name TEXT,
        document_date TEXT,
        status TEXT NOT NULL CHECK (status IN ('draft', 'analyzing', 'ready', 'failed')),
        error_code TEXT,
        source TEXT NOT NULL CHECK (source IN ('scan', 'gallery', 'file')),
        mime_type TEXT NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg')),
        page_count INTEGER,
        file_size INTEGER NOT NULL,
        analysis TEXT,
        analysis_locale TEXT,
        analyzed_at TEXT,
        search_text TEXT NOT NULL DEFAULT '',
        attention_dismissed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE INDEX documents_deleted_created ON documents (deleted_at, created_at)`,
      `CREATE TABLE pages (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
        page_index INTEGER NOT NULL,
        relative_path TEXT NOT NULL,
        width INTEGER,
        height INTEGER
      )`,
      `CREATE UNIQUE INDEX pages_document_index ON pages (document_id, page_index)`,
      `CREATE TABLE deadlines (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        description TEXT NOT NULL,
        due_date TEXT NOT NULL,
        due_time TEXT,
        date_source TEXT NOT NULL CHECK (date_source IN ('explicit', 'computed', 'user')),
        original_date TEXT,
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')),
        status TEXT NOT NULL CHECK (status IN ('open', 'done', 'dismissed')),
        reminder_offsets_days TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE INDEX deadlines_status_due_date ON deadlines (status, due_date)`,
      `CREATE INDEX deadlines_document ON deadlines (document_id)`,
      `CREATE TABLE actions (
        id TEXT PRIMARY KEY NOT NULL,
        document_id TEXT NOT NULL REFERENCES documents (id) ON DELETE CASCADE,
        deadline_id TEXT REFERENCES deadlines (id) ON DELETE SET NULL,
        description TEXT NOT NULL,
        priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
        done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`,
      `CREATE INDEX actions_document ON actions (document_id)`,
      `CREATE TABLE scheduled_notifications (
        notification_id TEXT PRIMARY KEY NOT NULL,
        deadline_id TEXT NOT NULL REFERENCES deadlines (id) ON DELETE CASCADE,
        fire_at TEXT NOT NULL
      )`,
      `CREATE INDEX scheduled_notifications_deadline ON scheduled_notifications (deadline_id)`,
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    // Task 4.2: a deadline keeps the quote and the computation it came with (ANL-6), so they
    // survive a re-analysis that replaces the analysis but keeps this deadline (ANL-8).
    version: 2,
    statements: [
      `ALTER TABLE deadlines ADD COLUMN source_quote TEXT`,
      `ALTER TABLE deadlines ADD COLUMN source_page INTEGER`,
      `ALTER TABLE deadlines ADD COLUMN computation TEXT`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(db: SqlDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!row) throw new Error('Could not read the database schema version');
  return row.user_version;
}

/**
 * Brings the schema to the latest version. Idempotent: a database that is already current is left
 * untouched. Each migration and its `user_version` bump run in one transaction, so a failure rolls
 * both back. Connection pragmas (foreign keys, WAL) are set by the caller, outside any transaction.
 */
export async function migrate(
  db: SqlDatabase,
  migrations: readonly Migration[] = MIGRATIONS
): Promise<{ from: number; to: number }> {
  const from = await getSchemaVersion(db);
  const latest = migrations[migrations.length - 1]?.version ?? 0;
  if (from > latest) {
    throw new Error(`Database schema ${from} is newer than this app supports (${latest})`);
  }
  for (const migration of migrations) {
    if (migration.version <= from) continue;
    await db.transaction(async (tx) => {
      for (const statement of migration.statements) {
        await tx.execAsync(statement);
      }
      await tx.execAsync(`PRAGMA user_version = ${migration.version}`);
    });
  }
  return { from, to: Math.max(from, latest) };
}
