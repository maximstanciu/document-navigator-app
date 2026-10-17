import type { SqlDatabase, SqlValue } from './database';
import { buildAssignments, fromJson, placeholders, toJson, type Clock } from './sql';
import type { DeadlineRecord, DeadlineStatus } from './types';

type DeadlineRow = {
  id: string;
  document_id: string;
  kind: string;
  description: string;
  due_date: string;
  due_time: string | null;
  date_source: DeadlineRecord['dateSource'];
  original_date: string | null;
  confidence: DeadlineRecord['confidence'];
  status: DeadlineStatus;
  reminder_offsets_days: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = `id, document_id, kind, description, due_date, due_time, date_source, original_date,
  confidence, status, reminder_offsets_days, created_at, updated_at, deleted_at`;

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
  Partial<Pick<DeadlineRecord, 'dueTime' | 'originalDate' | 'status' | 'reminderOffsetsDays'>>;

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
        for (const deadline of deadlines) {
          await tx.runAsync(
            `INSERT INTO deadlines (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
              deadline.id,
              deadline.documentId,
              deadline.kind,
              deadline.description,
              deadline.dueDate,
              deadline.dueTime ?? null,
              deadline.dateSource,
              deadline.originalDate ?? null,
              deadline.confidence,
              deadline.status ?? 'open',
              toJson(deadline.reminderOffsetsDays ?? null),
              timestamp,
              timestamp,
            ]
          );
        }
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
          `UPDATE deadlines SET description = '', original_date = NULL, updated_at = ?, deleted_at = ?
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
