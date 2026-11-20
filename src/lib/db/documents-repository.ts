import { insertAction, WIPE_ACTION_CONTENT, type NewAction } from './actions-repository';
import { queueJobDeletion } from './analysis-job-deletions-repository';
import { fileDocuments } from './cases-repository';
import type { SqlDatabase, SqlExecutor } from './database';
import { insertDeadline, WIPE_DEADLINE_CONTENT, type NewDeadline } from './deadlines-repository';
import { replaceDocumentRefs } from './document-refs';
import { selectLinks } from './matter-numbers';
import { insertPages, type NewPage } from './pages-repository';
import { takeScheduledNotifications } from './scheduled-notifications-repository';
import { buildSearchText, normalizeForSearch, searchablePartsOfAnalysis } from './search-text';
import {
  analysisFromJson,
  buildAssignments,
  containsPattern,
  placeholders,
  toJson,
  type Clock,
} from './sql';
import { mergeReanalysis, type ExistingAction, type ExistingDeadline } from './merge-reanalysis';
import type { DocumentRecord, DocumentSummaryRecord, RelatedDocumentRecord } from './types';

type DocumentRow = {
  id: string;
  title: string;
  document_type: DocumentRecord['documentType'];
  sender_name: string | null;
  document_date: string | null;
  status: DocumentRecord['status'];
  error_code: DocumentRecord['errorCode'];
  analysis_job_id: string | null;
  case_id: string | null;
  source: DocumentRecord['source'];
  mime_type: DocumentRecord['mimeType'];
  page_count: number | null;
  file_size: number;
  analysis: string | null;
  analysis_locale: string | null;
  legal_memo_country: string | null;
  analyzed_at: string | null;
  search_text: string;
  attention_dismissed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const COLUMNS = `id, title, document_type, sender_name, document_date, status, error_code,
  analysis_job_id, case_id, source, mime_type, page_count, file_size, analysis, analysis_locale, legal_memo_country, analyzed_at,
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
    caseId: row.case_id,
    source: row.source,
    mimeType: row.mime_type,
    pageCount: row.page_count,
    fileSize: row.file_size,
    analysis: analysisFromJson(row.analysis),
    analysisLocale: row.analysis_locale,
    legalMemoCountry: row.legal_memo_country,
    analyzedAt: row.analyzed_at,
    searchText: row.search_text,
    attentionDismissedAt: row.attention_dismissed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  };
}

type DocumentSummaryRow = Pick<
  DocumentRow,
  | 'id'
  | 'title'
  | 'status'
  | 'document_type'
  | 'sender_name'
  | 'page_count'
  | 'created_at'
  | 'analyzed_at'
  | 'attention_dismissed_at'
  | 'case_id'
> & {
  has_fraud_signals: number;
  has_high_risk: number;
  country: string | null;
  case_archived: number;
};

/**
 * Active documents matching `where`, newest first, as summaries: SQLite works out the three facts
 * about the analysis, so the list never moves the analysis JSON or the search text into JS
 * (HOME-2). An analysis that isn't valid JSON reads as none, like `analysisFromJson()`.
 */
function selectSummaries(where = '') {
  return `SELECT id, title, status, document_type, sender_name, page_count, created_at,
      analyzed_at, attention_dismissed_at, case_id,
      COALESCE(json_array_length(analysis_json, '$.fraudSignals'), 0) > 0 AS has_fraud_signals,
      EXISTS (SELECT 1 FROM json_each(analysis_json, '$.risks')
        WHERE json_extract(value, '$.severity') = 'high') AS has_high_risk,
      json_extract(analysis_json, '$.documentCountry') AS country,
      EXISTS (SELECT 1 FROM cases
        WHERE cases.id = case_id AND cases.archived_at IS NOT NULL) AS case_archived
    FROM (SELECT *, CASE WHEN json_valid(analysis) THEN analysis END AS analysis_json
      FROM documents WHERE deleted_at IS NULL ${where})
    ORDER BY created_at DESC, id`;
}

/**
 * The document `id` through `executor`, so also inside a transaction: deleted or not, or with
 * `active` only while it isn't deleted.
 */
async function selectDocument(executor: SqlExecutor, id: string, { active = false } = {}) {
  const row = await executor.getFirstAsync<DocumentRow>(
    `SELECT ${COLUMNS} FROM documents WHERE id = ?${active ? ' AND deleted_at IS NULL' : ''}`,
    [id]
  );
  return row ? toRecord(row) : null;
}

function toSummaryRecord(row: DocumentSummaryRow): DocumentSummaryRecord {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    documentType: row.document_type,
    senderName: row.sender_name,
    pageCount: row.page_count,
    createdAt: row.created_at,
    analyzedAt: row.analyzed_at,
    attentionDismissedAt: row.attention_dismissed_at,
    caseId: row.case_id,
    hasFraudSignals: row.has_fraud_signals === 1,
    hasHighRisk: row.has_high_risk === 1,
    country: row.country,
    caseArchived: row.case_archived === 1,
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
  Partial<Pick<DocumentRecord, 'status' | 'pageCount' | 'caseId'>>;

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
  /** The country of the legal memo the server used (ANL-14); none when `null` or left out. */
  legalMemoCountry?: string | null;
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

/** How many related documents a document's screen lists (LINK-3). */
export const MAX_RELATED_DOCUMENTS = 3;

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
  return {
    /** The document, `null` when it doesn't exist or was deleted. */
    get: (id: string): Promise<DocumentRecord | null> => selectDocument(db, id, { active: true }),

    /**
     * Creates a document together with its pages in order, in one transaction: a draft never exists
     * without its pages (CAP-5). The page files must already be saved. A document added from a case
     * is filed in it (CASE-4), unless the case was deleted or archived meanwhile (CASE-6).
     */
    async create(input: NewDocument, pages: readonly NewPage[] = []): Promise<DocumentRecord> {
      const timestamp = now().toISOString();
      const document = await db.transaction(async (tx) => {
        await tx.runAsync(
          `INSERT INTO documents (id, title, status, case_id, source, mime_type, page_count,
            file_size, search_text, created_at, updated_at)
           VALUES (?, ?, ?,
             (SELECT id FROM cases WHERE id = ? AND deleted_at IS NULL AND archived_at IS NULL),
             ?, ?, ?, ?, ?, ?, ?)`,
          [
            input.id,
            input.title,
            input.status ?? 'draft',
            input.caseId ?? null,
            input.source,
            input.mimeType,
            input.pageCount ?? null,
            input.fileSize,
            searchTextOf({ title: input.title, senderName: null, analysis: null }),
            timestamp,
            timestamp,
          ]
        );
        await insertPages(tx, input.id, pages);
        return selectDocument(tx, input.id);
      });
      if (!document) throw new Error(`Document ${input.id} was not saved`);
      return document;
    },

    /** Active documents, newest first, without their analyses (HOME-2). */
    async listSummaries(): Promise<DocumentSummaryRecord[]> {
      const rows = await db.getAllAsync<DocumentSummaryRow>(selectSummaries());
      return rows.map(toSummaryRecord);
    },

    /** The titles of active documents, without reading their analyses: for the Deadlines tab (REM-1). */
    async listTitles(): Promise<{ id: string; title: string }[]> {
      return db.getAllAsync<{ id: string; title: string }>(
        'SELECT id, title FROM documents WHERE deleted_at IS NULL ORDER BY created_at DESC, id'
      );
    },

    /**
     * Case-insensitive search over title, sender, summary and key facts, Cyrillic included, without
     * the analyses of the documents found (HOME-3).
     */
    async searchSummaries(query: string): Promise<DocumentSummaryRecord[]> {
      const normalized = normalizeForSearch(query);
      if (!normalized) return [];
      const rows = await db.getAllAsync<DocumentSummaryRow>(
        selectSummaries(`AND search_text LIKE ? ESCAPE '\\'`),
        [containsPattern(normalized)]
      );
      return rows.map(toSummaryRecord);
    },

    async update(id: string, patch: DocumentPatch): Promise<DocumentRecord> {
      return db.transaction(async (tx) => {
        const current = await selectDocument(tx, id, { active: true });
        if (!current) throw new Error(`Document ${id} not found`);
        const next = { ...current, ...patch };
        const { sql, params } = buildAssignments(patch, PATCH_COLUMNS);
        await tx.runAsync(
          `UPDATE documents SET ${sql ? `${sql}, ` : ''}search_text = ?, updated_at = ? WHERE id = ?`,
          [...params, searchTextOf(next), now().toISOString(), id]
        );
        // The numbers are derived from the analysis (LINK-1): they change with it.
        if (patch.analysis !== undefined) await replaceDocumentRefs(tx, id, next.analysis);
        return (await selectDocument(tx, id)) as DocumentRecord;
      });
    },

    /**
     * Files the documents `ids` in the case `caseId`, or takes them out of any case with `null`
     * (CASE-2, CASE-4). `false`, with nothing filed, if the case is gone.
     */
    async moveToCase(ids: readonly string[], caseId: string | null): Promise<boolean> {
      return db.transaction((tx) => fileDocuments(tx, ids, caseId, now().toISOString()));
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
     * The document last analyzed under `jobId`, whatever its status now, for a tap on the push
     * about the job (ANL-12); `null` when it was deleted or analyzed again since.
     */
    async findIdByAnalysisJob(jobId: string): Promise<string | null> {
      const row = await db.getFirstAsync<{ id: string }>(
        'SELECT id FROM documents WHERE deleted_at IS NULL AND analysis_job_id = ?',
        [jobId]
      );
      return row?.id ?? null;
    },

    /**
     * Stores a finished analysis (ANL-2): the document takes its type, sender and date from it,
     * and its title unless the person named it, and becomes `ready`. A re-analysis merges by ANL-8
     * (`mergeReanalysis()`): what the person did to deadlines stays, the rest is replaced; replaced
     * deadlines and actions are wiped like deleted ones, and their scheduled reminders are left for
     * `syncReminders()` to cancel. One transaction, read and write, so «Done» pressed while the
     * analysis ran is not lost. The explanation language is the one the job asked for. The job is
     * queued for deletion on the server in the same transaction (SPEC §7.2 «Опрос»). So are the
     * document's numbers for related documents: those of the new analysis replace the old (LINK-1).
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
            { title: current.title, analysis: analysisFromJson(current.analysis) },
            analysis
          ),
          senderName: analysis.sender?.name ?? null,
        };
        await tx.runAsync(
          `UPDATE documents SET title = ?, document_type = ?, sender_name = ?, document_date = ?,
             status = 'ready', error_code = NULL, page_count = ?, analysis = ?,
             analysis_locale = analysis_job_locale, legal_memo_country = ?, analyzed_at = ?,
             search_text = ?, updated_at = ?
           WHERE id = ?`,
          [
            named.title,
            analysis.documentType,
            named.senderName,
            analysis.documentDate,
            outcome.pageCount,
            toJson(analysis),
            outcome.legalMemoCountry ?? null,
            timestamp,
            searchTextOf({ ...named, analysis }),
            timestamp,
            id,
          ]
        );
        await replaceDocumentRefs(tx, id, analysis);

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
            `UPDATE deadlines SET ${WIPE_DEADLINE_CONTENT}, updated_at = ?, deleted_at = ?
             WHERE id IN (${placeholders(merge.removeDeadlineIds.length)})`,
            [timestamp, timestamp, ...merge.removeDeadlineIds]
          );
        }
        if (merge.removeActionIds.length > 0) {
          await tx.runAsync(
            `UPDATE actions SET ${WIPE_ACTION_CONTENT}, updated_at = ?, deleted_at = ?
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
     * The documents related to `id` (LINK-2): those that share a number with it, by the rule of
     * `selectLinks()`, without the pairs marked «Not related» (LINK-4). Newest first, at most
     * `MAX_RELATED_DOCUMENTS` (LINK-3). The link is not stored: it is found each time, among the
     * documents with an analysis, which a document being analyzed again still has.
     */
    async listRelated(id: string): Promise<RelatedDocumentRecord[]> {
      return db.transaction(async (tx) => {
        const refs = await tx.getAllAsync<{
          document_id: string;
          value: string;
          sender_key: string | null;
          created_at: string;
        }>(
          `SELECT r.document_id, r.value, r.sender_key, d.created_at
           FROM document_refs r JOIN documents d ON d.id = r.document_id
           WHERE d.deleted_at IS NULL
             AND r.value IN (SELECT value FROM document_refs WHERE document_id = ?)
           ORDER BY r.rowid`,
          [id]
        );
        const links = selectLinks(
          id,
          refs.map((row) => ({
            documentId: row.document_id,
            value: row.value,
            senderKey: row.sender_key,
          }))
        );
        if (links.size === 0) return [];

        const dismissed = await tx.getAllAsync<{ other: string }>(
          `SELECT CASE WHEN document_id_a = ? THEN document_id_b ELSE document_id_a END AS other
           FROM document_link_dismissals WHERE document_id_a = ? OR document_id_b = ?`,
          [id, id, id]
        );
        for (const pair of dismissed) links.delete(pair.other);
        if (links.size === 0) return [];

        // A number can stand in many documents (every invoice of one contract): only the newest
        // few are read.
        const createdAt = new Map(refs.map((row) => [row.document_id, row.created_at]));
        const newest = [...links.keys()]
          .sort((a, b) => {
            const [left, right] = [createdAt.get(a) ?? '', createdAt.get(b) ?? ''];
            if (left !== right) return left < right ? 1 : -1;
            return a < b ? -1 : 1;
          })
          .slice(0, MAX_RELATED_DOCUMENTS);
        const rows = await tx.getAllAsync<
          Pick<DocumentRow, 'id' | 'title' | 'document_date' | 'created_at' | 'case_id'>
        >(
          `SELECT id, title, document_date, created_at, case_id FROM documents
           WHERE id IN (${placeholders(newest.length)}) AND deleted_at IS NULL
           ORDER BY created_at DESC, id`,
          newest
        );
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          documentDate: row.document_date,
          createdAt: row.created_at,
          caseId: row.case_id,
          sharedNumber: links.get(row.id) as string,
        }));
      });
    },

    /**
     * «Not related» (LINK-4): the two documents are never listed as related again, on the screen of
     * either, after a new analysis too. Nothing is stored if one of them is gone.
     */
    async dismissLink(id: string, otherId: string): Promise<void> {
      if (id === otherId) return;
      const [a, b] = id < otherId ? [id, otherId] : [otherId, id];
      await db.runAsync(
        `INSERT OR IGNORE INTO document_link_dismissals (document_id_a, document_id_b, created_at)
         SELECT ?, ?, ?
         WHERE (SELECT COUNT(*) FROM documents WHERE id IN (?, ?) AND deleted_at IS NULL) = 2`,
        [a, b, now().toISOString(), a, b]
      );
    },

    /**
     * Deletes a document (STO-6): wipes its content and that of its deadlines and actions, removes
     * its page rows, scheduled reminders, numbers and «Not related» pairs (LINK-5), and keeps a
     * tombstone for future sync. The job of an analysis that is running, or whose upload may have
     * reached the server before it broke off, is queued for deletion there. The caller deletes the
     * returned page files, cancels the returned notifications and sends the queued deletions.
     * Returns `null` if already gone.
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
        await tx.runAsync('DELETE FROM document_refs WHERE document_id = ?', [id]);
        await tx.runAsync(
          'DELETE FROM document_link_dismissals WHERE document_id_a = ? OR document_id_b = ?',
          [id, id]
        );

        const deadlineIds = (
          await tx.getAllAsync<{ id: string }>('SELECT id FROM deadlines WHERE document_id = ?', [
            id,
          ])
        ).map((row) => row.id);
        const notificationIds = await takeScheduledNotifications(tx, deadlineIds);

        await tx.runAsync(
          `UPDATE deadlines SET ${WIPE_DEADLINE_CONTENT}, updated_at = ?,
             deleted_at = COALESCE(deleted_at, ?)
           WHERE document_id = ?`,
          [timestamp, timestamp, id]
        );
        await tx.runAsync(
          `UPDATE actions SET ${WIPE_ACTION_CONTENT}, updated_at = ?,
             deleted_at = COALESCE(deleted_at, ?)
           WHERE document_id = ?`,
          [timestamp, timestamp, id]
        );
        await tx.runAsync(
          `UPDATE documents SET title = '', document_type = NULL, sender_name = NULL,
             document_date = NULL, error_code = NULL, analysis_job_id = NULL,
             analysis_job_locale = NULL, case_id = NULL, analysis = NULL, analysis_locale = NULL,
             legal_memo_country = NULL, search_text = '', updated_at = ?, deleted_at = ?
           WHERE id = ?`,
          [timestamp, timestamp, id]
        );

        return { pagePaths: pages.map((page) => page.relative_path), notificationIds };
      });
    },
  };
}

export type DocumentsRepository = ReturnType<typeof createDocumentsRepository>;
