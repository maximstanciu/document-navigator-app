import { isCalendarDate } from '@/shared/calendar-date';

import type { SqlDatabase, SqlExecutor, SqlValue } from './database';
import { buildAssignments, fromJson, placeholders, toJson, type Clock } from './sql';
import type { DeadlineRecord, DeadlineStatus } from './types';

type DeadlineRow = {
  id: string;
  document_id: string;
  kind: DeadlineRecord['kind'];
  description: string;
  due_date: string;
  due_time: string | null;
  date_source: DeadlineRecord['dateSource'];
  original_date: string | null;
  source_quote: string | null;
  source_page: number | null;
  computation: string | null;
  confidence: DeadlineRecord['confidence'];
  status: DeadlineStatus;
  reminder_offsets_days: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = `id, document_id, kind, description, due_date, due_time, date_source, original_date,
  source_quote, source_page, computation, confidence, status, reminder_offsets_days, created_at,
  updated_at, deleted_at`;

function toOffsets(value: string | null): number[] | null {
  const parsed = fromJson(value);
  return Array.isArray(parsed) && parsed.every((item) => typeof item === 'number') ? parsed : null;
}

function toRecord(row: DeadlineRow): DeadlineRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    kind: row.kind,
    description: row.description,
    dueDate: row.due_date,
    dueTime: row.due_time,
    dateSource: row.date_source,
    originalDate: row.original_date,
    sourceQuote: row.source_quote,
    sourcePage: row.source_page,
    computation: row.computation,
    confidence: row.confidence,
    status: row.status,
    reminderOffsetsDays: toOffsets(row.reminder_offsets_days),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export type NewDeadline = Pick<
  DeadlineRecord,
  'id' | 'documentId' | 'kind' | 'description' | 'dueDate' | 'dateSource' | 'confidence'
> &
  Partial<
    Pick<
      DeadlineRecord,
      | 'dueTime'
      | 'originalDate'
      | 'sourceQuote'
      | 'sourcePage'
      | 'computation'
      | 'status'
      | 'reminderOffsetsDays'
    >
  >;

export type DeadlinePatch = Partial<
  Pick<
    DeadlineRecord,
    | 'kind'
    | 'description'
    | 'dueDate'
    | 'dueTime'
    | 'dateSource'
    | 'originalDate'
    | 'confidence'
    | 'status'
    | 'reminderOffsetsDays'
  >
>;

const text = (value: string | null) => value;
const PATCH_COLUMNS = {
  kind: { column: 'kind', toSql: text },
  description: { column: 'description', toSql: text },
  dueDate: { column: 'due_date', toSql: text },
  dueTime: { column: 'due_time', toSql: text },
  dateSource: { column: 'date_source', toSql: text },
  originalDate: { column: 'original_date', toSql: text },
  confidence: { column: 'confidence', toSql: text },
  status: { column: 'status', toSql: text },
  reminderOffsetsDays: {
    column: 'reminder_offsets_days',
    toSql: (value: number[] | null) => toJson(value),
  },
} as const;

export type DeadlineFilter = { documentId?: string; statuses?: readonly DeadlineStatus[] };

/**
 * REM-9 for a deadline with actions, through `tx`: it is `done` when every one of its actions is,
 * `open` otherwise. A deadline marked «Not relevant» (`dismissed`) keeps that status.
 */
export async function settleDeadlineStatus(tx: SqlExecutor, deadlineId: string, timestamp: string) {
  await tx.runAsync(
    `UPDATE deadlines SET updated_at = ?, status = CASE WHEN EXISTS (
       SELECT 1 FROM actions WHERE deadline_id = deadlines.id AND deleted_at IS NULL AND done = 0
     ) THEN 'open' ELSE 'done' END
     WHERE id = ? AND deleted_at IS NULL AND status != 'dismissed'`,
    [timestamp, deadlineId]
  );
}

/** Inserts one deadline through `tx`, so other repositories can add deadlines inside their transaction. */
export async function insertDeadline(tx: SqlExecutor, deadline: NewDeadline, timestamp: string) {
  await tx.runAsync(
    `INSERT INTO deadlines (${COLUMNS})
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      deadline.id,
      deadline.documentId,
      deadline.kind,
      deadline.description,
      deadline.dueDate,
      deadline.dueTime ?? null,
      deadline.dateSource,
      deadline.originalDate ?? null,
      deadline.sourceQuote ?? null,
      deadline.sourcePage ?? null,
      deadline.computation ?? null,
      deadline.confidence,
      deadline.status ?? 'open',
      toJson(deadline.reminderOffsetsDays ?? null),
      timestamp,
      timestamp,
    ]
  );
}

export function createDeadlinesRepository(db: SqlDatabase, now: Clock) {
  async function get(id: string): Promise<DeadlineRecord | null> {
    const row = await db.getFirstAsync<DeadlineRow>(
      `SELECT ${COLUMNS} FROM deadlines WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? toRecord(row) : null;
  }

  return {
    get,

    async insertMany(deadlines: readonly NewDeadline[]): Promise<void> {
      if (deadlines.length === 0) return;
      const timestamp = now().toISOString();
      await db.transaction(async (tx) => {
        for (const deadline of deadlines) await insertDeadline(tx, deadline, timestamp);
      });
    },

    /** Active deadlines, soonest first; optionally of one document or with given statuses. */
    async list(filter: DeadlineFilter = {}): Promise<DeadlineRecord[]> {
      const conditions = ['deleted_at IS NULL'];
      const params: SqlValue[] = [];
      if (filter.documentId !== undefined) {
        conditions.push('document_id = ?');
        params.push(filter.documentId);
      }
      if (filter.statuses !== undefined) {
        if (filter.statuses.length === 0) return [];
        conditions.push(`status IN (${placeholders(filter.statuses.length)})`);
        params.push(...filter.statuses);
      }
      const rows = await db.getAllAsync<DeadlineRow>(
        `SELECT ${COLUMNS} FROM deadlines WHERE ${conditions.join(' AND ')}
         ORDER BY due_date, COALESCE(due_time, '24:00'), id`,
        params
      );
      return rows.map(toRecord);
    },

    async update(id: string, patch: DeadlinePatch): Promise<DeadlineRecord> {
      const { sql, params } = buildAssignments(patch, PATCH_COLUMNS);
      const result = await db.runAsync(
        `UPDATE deadlines SET ${sql ? `${sql}, ` : ''}updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        [...params, now().toISOString(), id]
      );
      if (result.changes === 0) throw new Error(`Deadline ${id} not found`);
      return (await get(id)) as DeadlineRecord;
    },

    /**
     * «Change date» (US-8, DET-4): the person's date wins. The deadline becomes `dateSource: 'user'`
     * and remembers the analysis's date in `originalDate` the first time, so a re-analysis keeps it
     * and doesn't bring the old date back as a new deadline (ANL-8).
     */
    async changeDate(id: string, dueDate: string): Promise<void> {
      if (!isCalendarDate(dueDate)) throw new Error(`Not a calendar date: ${dueDate}`);
      // SET reads the row as it was, so original_date takes the date before this change.
      const result = await db.runAsync(
        `UPDATE deadlines SET due_date = ?, date_source = 'user', updated_at = ?,
           original_date = CASE WHEN date_source = 'user' THEN original_date ELSE due_date END
         WHERE id = ? AND deleted_at IS NULL`,
        [dueDate, now().toISOString(), id]
      );
      if (result.changes === 0) throw new Error(`Deadline ${id} not found`);
    },

    /**
     * Brings a deadline marked «Not relevant» back (DET-4): `open`, or `done` if it has actions and
     * all of them are done (REM-9). Nothing happens to a deadline in another status.
     */
    async restore(id: string): Promise<void> {
      const timestamp = now().toISOString();
      await db.transaction(async (tx) => {
        const result = await tx.runAsync(
          `UPDATE deadlines SET status = 'open', updated_at = ?
           WHERE id = ? AND deleted_at IS NULL AND status = 'dismissed'`,
          [timestamp, id]
        );
        if (result.changes === 0) return;
        const action = await tx.getFirstAsync<{ id: string }>(
          'SELECT id FROM actions WHERE deadline_id = ? AND deleted_at IS NULL LIMIT 1',
          [id]
        );
        if (action) await settleDeadlineStatus(tx, id, timestamp);
      });
    },

    /** Soft-deletes a deadline, wipes its description and drops its scheduled reminders, returning their ids. */
    async remove(id: string): Promise<string[]> {
      return db.transaction(async (tx) => {
        const notificationIds = (
          await tx.getAllAsync<{ notification_id: string }>(
            'SELECT notification_id FROM scheduled_notifications WHERE deadline_id = ?',
            [id]
          )
        ).map((row) => row.notification_id);
        await tx.runAsync('DELETE FROM scheduled_notifications WHERE deadline_id = ?', [id]);
        const timestamp = now().toISOString();
        await tx.runAsync(
          `UPDATE deadlines SET description = '', original_date = NULL, source_quote = NULL,
             computation = NULL, updated_at = ?, deleted_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [timestamp, timestamp, id]
        );
        await tx.runAsync(
          'UPDATE actions SET deadline_id = NULL, updated_at = ? WHERE deadline_id = ?',
          [timestamp, id]
        );
        return notificationIds;
      });
    },
  };
}

export type DeadlinesRepository = ReturnType<typeof createDeadlinesRepository>;
