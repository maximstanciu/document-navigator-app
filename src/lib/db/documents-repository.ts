import type { SqlDatabase } from './database';
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
import type { DocumentRecord } from './types';

type DocumentRow = {
  id: string;
  title: string;
  document_type: DocumentRecord['documentType'];
  sender_name: string | null;
  document_date: string | null;
  status: DocumentRecord['status'];
  error_code: DocumentRecord['errorCode'];
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

const COLUMNS = `id, title, document_type, sender_name, document_date, status, error_code, source,
  mime_type, page_count, file_size, analysis, analysis_locale, analyzed_at, search_text,
  attention_dismissed_at, created_at, updated_at, deleted_at`;

function toRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    title: row.title,
    documentType: row.document_type,
    senderName: row.sender_name,
    documentDate: row.document_date,
    status: row.status,
    errorCode: row.error_code,
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
     * Deletes a document (STO-6): wipes its content and that of its deadlines and actions, removes
     * its page rows and scheduled reminders, and keeps a tombstone for future sync. The caller deletes
     * the returned page files and cancels the returned notifications. Returns `null` if already gone.
     */
    async remove(id: string): Promise<RemovedDocument | null> {
      return db.transaction(async (tx) => {
        const exists = await tx.getFirstAsync<{ id: string }>(
          'SELECT id FROM documents WHERE id = ? AND deleted_at IS NULL',
          [id]
        );
        if (!exists) return null;
        const timestamp = now().toISOString();

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
          `UPDATE deadlines SET description = '', original_date = NULL, updated_at = ?,
             deleted_at = COALESCE(deleted_at, ?)
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
             document_date = NULL, error_code = NULL, analysis = NULL, analysis_locale = NULL,
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
