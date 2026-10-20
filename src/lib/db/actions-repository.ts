import type { SqlDatabase, SqlExecutor } from './database';
import { settleDeadlineStatus } from './deadlines-repository';
import { buildAssignments, toFlag, type Clock } from './sql';
import type { ActionRecord } from './types';

type ActionRow = {
  id: string;
  document_id: string;
  deadline_id: string | null;
  description: string;
  priority: ActionRecord['priority'];
  done: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS =
  'id, document_id, deadline_id, description, priority, done, created_at, updated_at, deleted_at';

function toRecord(row: ActionRow): ActionRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    deadlineId: row.deadline_id,
    description: row.description,
    priority: row.priority,
    done: row.done === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export type NewAction = Pick<ActionRecord, 'id' | 'documentId' | 'description' | 'priority'> &
  Partial<Pick<ActionRecord, 'deadlineId' | 'done'>>;

export type ActionPatch = Partial<
  Pick<ActionRecord, 'deadlineId' | 'description' | 'priority' | 'done'>
>;

const PATCH_COLUMNS = {
  deadlineId: { column: 'deadline_id', toSql: (value: string | null) => value },
  description: { column: 'description', toSql: (value: string | null) => value },
  priority: { column: 'priority', toSql: (value: string | null) => value },
  done: { column: 'done', toSql: (value: boolean | null) => toFlag(Boolean(value)) },
} as const;

/** Inserts one action through `tx`, so other repositories can add actions inside their transaction. */
export async function insertAction(tx: SqlExecutor, action: NewAction, timestamp: string) {
  await tx.runAsync(`INSERT INTO actions (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`, [
    action.id,
    action.documentId,
    action.deadlineId ?? null,
    action.description,
    action.priority,
    toFlag(action.done ?? false),
    timestamp,
    timestamp,
  ]);
}

export function createActionsRepository(db: SqlDatabase, now: Clock) {
  async function get(id: string): Promise<ActionRecord | null> {
    const row = await db.getFirstAsync<ActionRow>(
      `SELECT ${COLUMNS} FROM actions WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? toRecord(row) : null;
  }

  return {
    get,

    async insertMany(actions: readonly NewAction[]): Promise<void> {
      if (actions.length === 0) return;
      const timestamp = now().toISOString();
      await db.transaction(async (tx) => {
        for (const action of actions) await insertAction(tx, action, timestamp);
      });
    },

    /** Active actions of a document, in insertion order (the order the analysis listed them). */
    async listByDocument(documentId: string): Promise<ActionRecord[]> {
      const rows = await db.getAllAsync<ActionRow>(
        `SELECT ${COLUMNS} FROM actions WHERE document_id = ? AND deleted_at IS NULL
         ORDER BY created_at, rowid`,
        [documentId]
      );
      return rows.map(toRecord);
    },

    /**
     * Active actions due by a deadline, of every document (DET-3): the Deadlines tab shows them with
     * their deadline. In insertion order.
     */
    async listDated(): Promise<ActionRecord[]> {
      const rows = await db.getAllAsync<ActionRow>(
        `SELECT ${COLUMNS} FROM actions WHERE deadline_id IS NOT NULL AND deleted_at IS NULL
         ORDER BY created_at, rowid`
      );
      return rows.map(toRecord);
    },

    async listByDeadline(deadlineId: string): Promise<ActionRecord[]> {
      const rows = await db.getAllAsync<ActionRow>(
        `SELECT ${COLUMNS} FROM actions WHERE deadline_id = ? AND deleted_at IS NULL
         ORDER BY created_at, rowid`,
        [deadlineId]
      );
      return rows.map(toRecord);
    },

    async update(id: string, patch: ActionPatch): Promise<ActionRecord> {
      const { sql, params } = buildAssignments(patch, PATCH_COLUMNS);
      const result = await db.runAsync(
        `UPDATE actions SET ${sql ? `${sql}, ` : ''}updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
        [...params, now().toISOString(), id]
      );
      if (result.changes === 0) throw new Error(`Action ${id} not found`);
      return (await get(id)) as ActionRecord;
    },

    /**
     * Marks an action done or not (DET-3) and, in the same transaction, closes or reopens the
     * deadline it belongs to (REM-9).
     */
    async setDone(id: string, done: boolean): Promise<void> {
      const timestamp = now().toISOString();
      await db.transaction(async (tx) => {
        const row = await tx.getFirstAsync<{ deadline_id: string | null }>(
          'SELECT deadline_id FROM actions WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        if (!row) throw new Error(`Action ${id} not found`);
        await tx.runAsync('UPDATE actions SET done = ?, updated_at = ? WHERE id = ?', [
          toFlag(done),
          timestamp,
          id,
        ]);
        if (row.deadline_id) await settleDeadlineStatus(tx, row.deadline_id, timestamp);
      });
    },

    async remove(id: string): Promise<void> {
      const timestamp = now().toISOString();
      await db.runAsync(
        `UPDATE actions SET description = '', updated_at = ?, deleted_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, id]
      );
    },
  };
}

export type ActionsRepository = ReturnType<typeof createActionsRepository>;
