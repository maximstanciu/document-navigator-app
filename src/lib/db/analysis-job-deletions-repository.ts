import type { SqlDatabase, SqlExecutor } from './database';

/**
 * Queues a job to delete on the server (SPEC §6.2): its result is stored, the analysis was
 * cancelled, or the document deleted. Runs inside the caller's transaction, so the job is never
 * forgotten while the change that made it unneeded is kept. Queuing the same job twice keeps one row.
 */
export async function queueJobDeletion(tx: SqlExecutor, jobId: string, timestamp: string) {
  await tx.runAsync(
    'INSERT OR IGNORE INTO analysis_job_deletions (job_id, created_at) VALUES (?, ?)',
    [jobId, timestamp]
  );
}

/**
 * Analysis jobs waiting to be deleted on the server (SPEC §6.2). The app sends `DELETE` for each
 * at once, and again at startup and on return to the foreground; a row goes once the server answers.
 */
export function createAnalysisJobDeletionsRepository(db: SqlDatabase) {
  return {
    /** Job ids, oldest first. */
    async list(): Promise<string[]> {
      const rows = await db.getAllAsync<{ job_id: string }>(
        'SELECT job_id FROM analysis_job_deletions ORDER BY created_at, job_id'
      );
      return rows.map((row) => row.job_id);
    },

    async remove(jobId: string): Promise<void> {
      await db.runAsync('DELETE FROM analysis_job_deletions WHERE job_id = ?', [jobId]);
    },
  };
}

export type AnalysisJobDeletionsRepository = ReturnType<
  typeof createAnalysisJobDeletionsRepository
>;
