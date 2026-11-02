import type { SqlDatabase, SqlExecutor } from './database';
import { placeholders, type Clock } from './sql';
import type { CaseRecord } from './types';

type CaseRow = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = 'id, name, created_at, updated_at, deleted_at';

function toRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

export type NewCase = Pick<CaseRecord, 'id' | 'name'>;

/**
 * Files the active documents `documentIds` in the case `caseId`, or takes them out of any case with
 * `null` (CASE-2, CASE-4). Documents already there keep their `updated_at`. Returns `false`, and
 * files nothing, when the case is gone: a tombstone must not collect documents.
 */
export async function fileDocuments(
  tx: SqlExecutor,
  documentIds: readonly string[],
  caseId: string | null,
  timestamp: string
): Promise<boolean> {
  if (caseId !== null) {
    const exists = await tx.getFirstAsync<{ id: string }>(
      'SELECT id FROM cases WHERE id = ? AND deleted_at IS NULL',
      [caseId]
    );
    if (!exists) return false;
  }
  if (documentIds.length === 0) return true;
  await tx.runAsync(
    `UPDATE documents SET case_id = ?, updated_at = ?
     WHERE id IN (${placeholders(documentIds.length)}) AND deleted_at IS NULL AND case_id IS NOT ?`,
    [caseId, timestamp, ...documentIds, caseId]
  );
  return true;
}

export function createCasesRepository(db: SqlDatabase, now: Clock) {
  return {
    async get(id: string): Promise<CaseRecord | null> {
      const row = await db.getFirstAsync<CaseRow>(
        `SELECT ${COLUMNS} FROM cases WHERE id = ? AND deleted_at IS NULL`,
        [id]
      );
      return row ? toRecord(row) : null;
    },

    /** Active cases, newest first (CASE-3). */
    async list(): Promise<CaseRecord[]> {
      const rows = await db.getAllAsync<CaseRow>(
        `SELECT ${COLUMNS} FROM cases WHERE deleted_at IS NULL ORDER BY created_at DESC, id`
      );
      return rows.map(toRecord);
    },

    /**
     * Creates a case with the documents `documentIds` filed in it, in one transaction: «New case»
     * from a document's screen never leaves an empty case behind (CASE-2).
     */
    async create(input: NewCase, documentIds: readonly string[] = []): Promise<CaseRecord> {
      const timestamp = now().toISOString();
      const row = await db.transaction(async (tx) => {
        await tx.runAsync(
          'INSERT INTO cases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)',
          [input.id, input.name, timestamp, timestamp]
        );
        await fileDocuments(tx, documentIds, input.id, timestamp);
        return tx.getFirstAsync<CaseRow>(`SELECT ${COLUMNS} FROM cases WHERE id = ?`, [input.id]);
      });
      if (!row) throw new Error(`Case ${input.id} was not saved`);
      return toRecord(row);
    },

    /** `false` if the case is gone. */
    async rename(id: string, name: string): Promise<boolean> {
      const result = await db.runAsync(
        'UPDATE cases SET name = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
        [name, now().toISOString(), id]
      );
      return result.changes > 0;
    },

    /**
     * Deletes a case (CASE-5): its documents stay, out of any case. The name is wiped at once and a
     * tombstone kept for future sync, like a deleted document's (STO-6). `false` if already gone.
     */
    async remove(id: string): Promise<boolean> {
      const timestamp = now().toISOString();
      return db.transaction(async (tx) => {
        const result = await tx.runAsync(
          `UPDATE cases SET name = '', updated_at = ?, deleted_at = ?
           WHERE id = ? AND deleted_at IS NULL`,
          [timestamp, timestamp, id]
        );
        if (result.changes === 0) return false;
        await tx.runAsync(
          'UPDATE documents SET case_id = NULL, updated_at = ? WHERE case_id = ? AND deleted_at IS NULL',
          [timestamp, id]
        );
        return true;
      });
    },
  };
}

export type CasesRepository = ReturnType<typeof createCasesRepository>;
