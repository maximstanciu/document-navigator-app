import { insertAction, type NewAction } from './actions-repository';
import { queueJobDeletion } from './analysis-job-deletions-repository';
import type { SqlDatabase } from './database';
import { insertDeadline, type NewDeadline } from './deadlines-repository';
import type { NewPage } from './pages-repository';
import { buildSearchText, normalizeForSearch, searchablePartsOfAnalysis } from './search-text';
import {
  buildAssignments,
  containsPattern,
  fromJson,
  placeholders,
  toJson,
  type Clock,
} from './sql';
import { mergeReanalysis, type ExistingAction, type ExistingDeadline } from './merge-reanalysis';
import type { DocumentRecord } from './types';

type DocumentRow = {
  id: string;
  title: string;
  document_type: DocumentRecord['documentType'];
  sender_name: string | null;
  document_date: string | null;
  status: DocumentRecord['status'];
  error_code: DocumentRecord['errorCode'];
  analysis_job_id: string | null;
  source: DocumentRecord['source'];
  mime_type: DocumentRecord['mimeType'];
  page_count: number | null;
  file_size: number;
  analysis: string | null;
  analysis_locale: string | null;
  analyzed_at: string | null;
  search_text: string;
  attention_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = `id, title, document_type, sender_name, document_date, status, error_code,
  analysis_job_id, source, mime_type, page_count, file_size, analysis, analysis_locale, analyzed_at,
  search_text, attention_dismissed_at, created_at, updated_at, deleted_at`;

function toRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    senderName: row.sender_name,
    documentDate: row.document_date,
    status: row.status,
    errorCode: row.error_code,
    analysisJobId: row.analysis_job_id,
    source: row.source,
    mimeType: row.mime_type,
    pageCount: row.page_count,
    fileSize: row.file_size,
    // Only an analysis that passed the shared schema is written; a new shape bumps `schemaVersion`.
    analysis: fromJson(row.analysis) as DocumentRecord['analysis'],
    analysisLocale: row.analysis_locale,
    analyzedAt: row.analyzed_at,
    searchText: row.search_text,
    attentionDismissedAt: row.attention_dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

function searchTextOf(document: Pick<DocumentRecord, 'title' | 'senderName' | 'analysis'>) {
  return buildSearchText([
    document.title,
    document.senderName,
    ...searchablePartsOfAnalysis(document.analysis),
  ]);
}

export type NewDocument = Pick<
  DocumentRecord,
  'id' | 'title' | 'source' | 'mimeType' | 'fileSize'
> &
  Partial<Pick<DocumentRecord, 'status' | 'pageCount'>>;

/** Fields a feature may change. `searchText` is derived from title, sender and analysis, never set directly. */
export type DocumentPatch = Partial<
  Pick<
    DocumentRecord,
    | 'title'
    | 'documentType'
    | 'senderName'
    | 'documentDate'
    | 'status'
    | 'errorCode'
    | 'pageCount'
    | 'fileSize'
    | 'analysis'
    | 'analysisLocale'
    | 'analyzedAt'
    | 'attentionDismissedAt'
  >
>;

const text = (value: string | null) => value;
const PATCH_COLUMNS = {
  title: { column: 'title', toSql: text },
  documentType: { column: 'document_type', toSql: text },
  senderName: { column: 'sender_name', toSql: text },
  documentDate: { column: 'document_date', toSql: text },
  status: { column: 'status', toSql: text },
  errorCode: { column: 'error_code', toSql: text },
  pageCount: { column: 'page_count', toSql: (value: number | null) => value },
  fileSize: { column: 'file_size', toSql: (value: number | null) => value },
  analysis: { column: 'analysis', toSql: (value: DocumentRecord['analysis']) => toJson(value) },
  analysisLocale: { column: 'analysis_locale', toSql: text },
  analyzedAt: { column: 'analyzed_at', toSql: text },
  attentionDismissedAt: { column: 'attention_dismissed_at', toSql: text },
} as const;

/** What the caller still has to clean up outside the database after a delete (STO-6). */
export type RemovedDocument = { pagePaths: string[]; notificationIds: string[] };

/** The job an analysis runs as on the server (SPEC §7.2), and the explanation language it asked for. */
export type AnalysisJobRef = { jobId: string; locale: string };

/**
 * A finished analysis with the deadlines and actions made from it, ready to store. It belongs to
 * the job that produced it: a document analyzing under another job isn't written.
 */
export type AnalysisOutcome = {
  jobId: string;
  analysis: NonNullable<DocumentRecord['analysis']>;
  /** What the server counted (D-4). */
  pageCount: number;
  deadlines: readonly NewDeadline[];
  actions: readonly NewAction[];
};

/** Why the analysis under `jobId` failed; `removeJob` also queues the job for deletion on the server. */
export type AnalysisFailure = {
  jobId: string;
  code: NonNullable<DocumentRecord['errorCode']>;
  removeJob?: boolean;
};

/** Statuses an analysis can start from (SPEC §6.3): a `ready` document is analyzed again (ANL-8). */
const ANALYZABLE = `('draft', 'failed', 'ready')`;

/**
 * The title a finished analysis leaves the document with: the analysis names it, unless the person
 * did — a title other than the previous analysis's, or any title before the first analysis.
 */
function titleAfterAnalysis(
  current: { title: string; analysis: DocumentRecord['analysis'] },
  analysis: NonNullable<DocumentRecord['analysis']>
): string {
  const named = current.analysis
    ? current.title !== current.analysis.title
    : current.title.trim() !== '';
  return named ? current.title : analysis.title;
}

export function createDocumentsRepository(db: SqlDatabase, now: Clock) {
  async function get(id: string): Promise<DocumentRecord | null> {
    const row = await db.getFirstAsync<DocumentRow>(
      `SELECT ${COLUMNS} FROM documents WHERE id = ? AND deleted_at IS NULL`,
      [id]
    );
    return row ? toRecord(row) : null;
  }

  return {
    get,

    /**
     * Creates a document together with its pages in order, in one transaction: a draft never exists
     * without its pages (CAP-5). The page files must already be saved.
     */
    async create(input: NewDocument, pages: readonly NewPage[] = []): Promise<DocumentRecord> {
      const timestamp = now().toISOString();
      const row = await db.transaction(async (tx) => {
        await tx.runAsync(
          `INSERT INTO documents (id, title, status, source, mime_type, page_count, file_size,
            search_text, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.id,
            input.title,
            input.status ?? 'draft',
            input.source,
            input.mimeType,
            input.pageCount ?? null,
            input.fileSize,
            searchTextOf({ title: input.title, senderName: null, analysis: null }),
            timestamp,
            timestamp,
          ]
        );
        for (const [index, page] of pages.entries()) {
          await tx.runAsync(
            `INSERT INTO pages (id, document_id, page_index, relative_path, width, height)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [page.id, input.id, index, page.relativePath, page.width, page.height]
          );
        }
        return tx.getFirstAsync<DocumentRow>(`SELECT ${COLUMNS} FROM documents WHERE id = ?`, [
          input.id,
        ]);
      });
      if (!row) throw new Error(`Document ${input.id} was not saved`);
      return toRecord(row);
    },

    /** Active documents, newest first (HOME-2). */
    async list(): Promise<DocumentRecord[]> {
      const rows = await db.getAllAsync<DocumentRow>(
        `SELECT ${COLUMNS} FROM documents WHERE deleted_at IS NULL ORDER BY created_at DESC, id`
      );
      return rows.map(toRecord);
    },

    /** The titles of active documents, without reading their analyses: for the Deadlines tab (REM-1). */
    async listTitles(): Promise<{ id: string; title: string }[]> {
      return db.getAllAsync<{ id: string; title: string }>(
        'SELECT id, title FROM documents WHERE deleted_at IS NULL ORDER BY created_at DESC, id'
      );
    },

    /** Case-insensitive search over title, sender, summary and key facts, Cyrillic included (HOME-3). */
    async search(query: string): Promise<DocumentRecord[]> {
      const normalized = normalizeForSearch(query);
      if (!normalized) return [];
      const rows = await db.getAllAsync<DocumentRow>(
        `SELECT ${COLUMNS} FROM documents
         WHERE deleted_at IS NULL AND search_text LIKE ? ESCAPE '\\'
         ORDER BY created_at DESC, id`,
        [containsPattern(normalized)]
      );
      return rows.map(toRecord);
    },

    async update(id: string, patch: DocumentPatch): Promise<DocumentRecord> {
      return db.transaction(async (tx) => {
        const row = await tx.getFirstAsync<DocumentRow>(
          `SELECT ${COLUMNS} FROM documents WHERE id = ? AND deleted_at IS NULL`,
          [id]
        );
        if (!row) throw new Error(`Document ${id} not found`);
        const next = { ...toRecord(row), ...patch };
        const { sql, params } = buildAssignments(patch, PATCH_COLUMNS);
        await tx.runAsync(
          `UPDATE documents SET ${sql ? `${sql}, ` : ''}search_text = ?, updated_at = ? WHERE id = ?`,
          [...params, searchTextOf(next), now().toISOString(), id]
        );
        const updated = await tx.getFirstAsync<DocumentRow>(
          `SELECT ${COLUMNS} FROM documents WHERE id = ?`,
          [id]
        );
        return toRecord(updated as DocumentRow);
      });
    },

    /**
     * «Got it» in «Needs attention» (HOME-1): the user has seen the fraud signs or high risk of the
     * current analysis. `false` if the document is gone.
     */
    async dismissAttention(id: string): Promise<boolean> {
      const timestamp = now().toISOString();
      const result = await db.runAsync(
        `UPDATE documents SET attention_dismissed_at = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
        [timestamp, timestamp, id]
      );
      return result.changes > 0;
    },

    /**
     * Moves a document to `analyzing` under the job `jobId` and clears the previous error (SPEC
     * §6.3): a draft, a failed one, or a ready one to analyze again (ANL-8), which keeps its
     * analysis until the new one is stored, and keeps it if the new one fails. The job id is stored
     * before the upload, so a broken upload can be checked with the server later (ANL-4, ANL-9).
     * `false` when the document is gone or in another status, e.g. already being analyzed: the
     * check and the change are one statement, so two taps can't start two analyses.
     */
    async startAnalysis(id: string, job: AnalysisJobRef): Promise<boolean> {
      const result = await db.runAsync(
        `UPDATE documents SET status = 'analyzing', error_code = NULL, analysis_job_id = ?,
           analysis_job_locale = ?, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL AND status IN ${ANALYZABLE}`,
        [job.jobId, job.locale, now().toISOString(), id]
      );
      return result.changes > 0;
    },

    /** Documents being analyzed with their jobs (SPEC §7.2 «Опрос»), oldest first. */
    async listAnalyzing(): Promise<{ id: string; jobId: string }[]> {
      return db.getAllAsync<{ id: string; jobId: string }>(
        `SELECT id, analysis_job_id AS jobId FROM documents
         WHERE deleted_at IS NULL AND status = 'analyzing' AND analysis_job_id IS NOT NULL
         ORDER BY created_at, id`
      );
    },

    /**
     * Stores a finished analysis (ANL-2): the document takes its type, sender and date from it,
     * and its title unless the person named it, and becomes `ready`. A re-analysis merges by ANL-8
     * (`mergeReanalysis()`): what the person did to deadlines stays, the rest is replaced; replaced
     * deadlines and actions are wiped like deleted ones, and their scheduled reminders are left for
     * `syncReminders()` to cancel. One transaction, read and write, so «Done» pressed while the
     * analysis ran is not lost. The explanation language is the one the job asked for. The job is
     * queued for deletion on the server in the same transaction (SPEC §7.2 «Опрос»).
     * Only a document still `analyzing` under `outcome.jobId` is written: `false` when it was
     * deleted, its analysis cancelled, or started again under another job meanwhile.
     */
    async saveAnalysis(id: string, outcome: AnalysisOutcome): Promise<boolean> {
      const timestamp = now().toISOString();
      return db.transaction(async (tx) => {
        const current = await tx.getFirstAsync<Pick<DocumentRow, 'title' | 'analysis'>>(
          `SELECT title, analysis FROM documents
           WHERE id = ? AND deleted_at IS NULL AND status = 'analyzing' AND analysis_job_id = ?`,
          [id, outcome.jobId]
        );
        if (!current) return false;
        await queueJobDeletion(tx, outcome.jobId, timestamp);
        const { analysis } = outcome;
        const named = {
          title: titleAfterAnalysis(
            {
              title: current.title,
              analysis: fromJson(current.analysis) as DocumentRecord['analysis'],
            },
            analysis
          ),
          senderName: analysis.sender?.name ?? null,
        };
        await tx.runAsync(
          `UPDATE documents SET title = ?, document_type = ?, sender_name = ?, document_date = ?,
             status = 'ready', error_code = NULL, page_count = ?, analysis = ?,
             analysis_locale = analysis_job_locale, analyzed_at = ?, search_text = ?, updated_at = ?
           WHERE id = ?`,
          [
            named.title,
            analysis.documentType,
            named.senderName,
            analysis.documentDate,
            outcome.pageCount,
            toJson(analysis),
            timestamp,
            searchTextOf({ ...named, analysis }),
            timestamp,
            id,
          ]
        );

        const deadlines = await tx.getAllAsync<{
          id: string;
          kind: ExistingDeadline['kind'];
          due_date: string;
          original_date: string | null;
          date_source: ExistingDeadline['dateSource'];
          status: ExistingDeadline['status'];
        }>(
          `SELECT id, kind, due_date, original_date, date_source, status FROM deadlines
           WHERE document_id = ? AND deleted_at IS NULL`,
          [id]
        );
        const actions = await tx.getAllAsync<{ id: string; deadline_id: string | null }>(
          'SELECT id, deadline_id FROM actions WHERE document_id = ? AND deleted_at IS NULL',
          [id]
        );
        const merge = mergeReanalysis(
          {
            deadlines: deadlines.map((row): ExistingDeadline => ({
              id: row.id,
              kind: row.kind,
              dueDate: row.due_date,
              originalDate: row.original_date,
              dateSource: row.date_source,
              status: row.status,
            })),
            actions: actions.map((row): ExistingAction => ({
              id: row.id,
              deadlineId: row.deadline_id,
            })),
          },
          outcome
        );
        if (merge.removeDeadlineIds.length > 0) {
          await tx.runAsync(
            `UPDATE deadlines SET description = '', original_date = NULL, source_quote = NULL,
               computation = NULL, updated_at = ?, deleted_at = ?
             WHERE id IN (${placeholders(merge.removeDeadlineIds.length)})`,
            [timestamp, timestamp, ...merge.removeDeadlineIds]
          );
        }
        if (merge.removeActionIds.length > 0) {
          await tx.runAsync(
            `UPDATE actions SET description = '', updated_at = ?, deleted_at = ?
             WHERE id IN (${placeholders(merge.removeActionIds.length)})`,
            [timestamp, timestamp, ...merge.removeActionIds]
          );
        }
        for (const deadline of merge.insertDeadlines) await insertDeadline(tx, deadline, timestamp);
        for (const action of merge.insertActions) await insertAction(tx, action, timestamp);
        return true;
      });
    },

    /**
     * Marks the analysis under `jobId` as failed with `code` (SPEC §6.3); with `removeJob`, the job
     * is queued for deletion on the server in the same transaction. `false` if the document isn't
     * analyzing under that job (deleted, cancelled, or started again meanwhile).
     */
    async failAnalysis(id: string, { jobId, code, removeJob = false }: AnalysisFailure) {
      const timestamp = now().toISOString();
      return db.transaction(async (tx) => {
        const result = await tx.runAsync(
          `UPDATE documents SET status = 'failed', error_code = ?, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL AND status = 'analyzing' AND analysis_job_id = ?`,
          [code, timestamp, id, jobId]
        );
        if (result.changes === 0) return false;
        if (removeJob) await queueJobDeletion(tx, jobId, timestamp);
        return true;
      });
    },

    /**
     * «Cancel the analysis» (ANL-13): the document goes back to `draft`, or to `ready` with its
     * previous analysis (ANL-8), and the job is queued for deletion on the server in the same
     * transaction, so its result is never stored. `false` if it isn't analyzing under `jobId`.
     */
    async cancelAnalysis(id: string, jobId: string): Promise<boolean> {
      const timestamp = now().toISOString();
      return db.transaction(async (tx) => {
        const result = await tx.runAsync(
          `UPDATE documents
           SET status = CASE WHEN analysis IS NULL THEN 'draft' ELSE 'ready' END,
             error_code = NULL, updated_at = ?
           WHERE id = ? AND deleted_at IS NULL AND status = 'analyzing' AND analysis_job_id = ?`,
          [timestamp, id, jobId]
        );
        if (result.changes === 0) return false;
        await queueJobDeletion(tx, jobId, timestamp);
        return true;
      });
    },

    /**
     * At startup a document analyzing without a job was left by a version of the app before the
     * analysis became a job: its request is lost, so it becomes `failed` with `interrupted` (ANL-4).
     * One with a job is asked about on the server instead. Returns how many there were.
     */
    async failInterruptedAnalyses(): Promise<number> {
      const result = await db.runAsync(
        `UPDATE documents SET status = 'failed', error_code = 'interrupted', updated_at = ?
         WHERE deleted_at IS NULL AND status = 'analyzing' AND analysis_job_id IS NULL`,
        [now().toISOString()]
      );
      return result.changes;
    },

    /**
     * Deletes a document (STO-6): wipes its content and that of its deadlines and actions, removes
     * its page rows and scheduled reminders, and keeps a tombstone for future sync. The job of an
     * analysis that is running, or whose upload may have reached the server before it broke off, is
     * queued for deletion there. The caller deletes the returned page files, cancels the returned
     * notifications and sends the queued deletions. Returns `null` if already gone.
     */
    async remove(id: string): Promise<RemovedDocument | null> {
      return db.transaction(async (tx) => {
        const exists = await tx.getFirstAsync<Pick<DocumentRow, 'status' | 'analysis_job_id'>>(
          'SELECT status, analysis_job_id FROM documents WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        if (!exists) return null;
        const timestamp = now().toISOString();
        if (
          exists.analysis_job_id &&
          (exists.status === 'analyzing' || exists.status === 'failed')
        ) {
          await queueJobDeletion(tx, exists.analysis_job_id, timestamp);
        }

        const pages = await tx.getAllAsync<{ relative_path: string }>(
          'SELECT relative_path FROM pages WHERE document_id = ? ORDER BY page_index',
          [id]
        );
        await tx.runAsync('DELETE FROM pages WHERE document_id = ?', [id]);

        const deadlineIds = (
          await tx.getAllAsync<{ id: string }>('SELECT id FROM deadlines WHERE document_id = ?', [
            id,
          ])
        ).map((row) => row.id);
        let notificationIds: string[] = [];
        if (deadlineIds.length > 0) {
          const inList = placeholders(deadlineIds.length);
          notificationIds = (
            await tx.getAllAsync<{ notification_id: string }>(
              `SELECT notification_id FROM scheduled_notifications WHERE deadline_id IN (${inList})`,
              deadlineIds
            )
          ).map((row) => row.notification_id);
          await tx.runAsync(
            `DELETE FROM scheduled_notifications WHERE deadline_id IN (${inList})`,
            deadlineIds
          );
        }

        await tx.runAsync(
          `UPDATE deadlines SET description = '', original_date = NULL, source_quote = NULL,
             computation = NULL, updated_at = ?, deleted_at = COALESCE(deleted_at, ?)
           WHERE document_id = ?`,
          [timestamp, timestamp, id]
        );
        await tx.runAsync(
          `UPDATE actions SET description = '', updated_at = ?, deleted_at = COALESCE(deleted_at, ?)
           WHERE document_id = ?`,
          [timestamp, timestamp, id]
        );
        await tx.runAsync(
          `UPDATE documents SET title = '', document_type = NULL, sender_name = NULL,
             document_date = NULL, error_code = NULL, analysis_job_id = NULL,
             analysis_job_locale = NULL, analysis = NULL, analysis_locale = NULL,
             search_text = '', updated_at = ?, deleted_at = ?
           WHERE id = ?`,
          [timestamp, timestamp, id]
        );

        return { pagePaths: pages.map((page) => page.relative_path), notificationIds };
      });
    },
  };
}

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
