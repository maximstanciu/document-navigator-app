import type { SqlDatabase } from './database';
import type { PageRecord } from './types';

type PageRow = {
  id: string;
  document_id: string;
  page_index: number;
  relative_path: string;
  width: number | null;
  height: number | null;
};

const COLUMNS = 'id, document_id, page_index, relative_path, width, height';

function toRecord(row: PageRow): PageRecord {
  return {
    id: row.id,
    documentId: row.document_id,
    index: row.page_index,
    relativePath: row.relative_path,
    width: row.width,
    height: row.height,
  };
}

export type NewPage = Omit<PageRecord, 'documentId' | 'index'>;

export function createPagesRepository(db: SqlDatabase) {
  return {
    /** Pages of a document in order. A PDF has one row with index 0 (D-4). */
    async listByDocument(documentId: string): Promise<PageRecord[]> {
      const rows = await db.getAllAsync<PageRow>(
        `SELECT ${COLUMNS} FROM pages WHERE document_id = ? ORDER BY page_index`,
        [documentId]
      );
      return rows.map(toRecord);
    },

    /**
     * Replaces the document's pages with `pages` in the given order (review screen edits, CAP-5).
     * Returns the relative paths that are no longer referenced, so the caller can delete the files.
     */
    async replaceForDocument(documentId: string, pages: readonly NewPage[]): Promise<string[]> {
      return db.transaction(async (tx) => {
        const previous = await tx.getAllAsync<{ relative_path: string }>(
          'SELECT relative_path FROM pages WHERE document_id = ?',
          [documentId]
        );
        await tx.runAsync('DELETE FROM pages WHERE document_id = ?', [documentId]);
        for (const [index, page] of pages.entries()) {
          await tx.runAsync(`INSERT INTO pages (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [
            page.id,
            documentId,
            index,
            page.relativePath,
            page.width,
            page.height,
          ]);
        }
        const kept = new Set(pages.map((page) => page.relativePath));
        return previous.map((row) => row.relative_path).filter((path) => !kept.has(path));
      });
    },
  };
}

export type PagesRepository = ReturnType<typeof createPagesRepository>;
