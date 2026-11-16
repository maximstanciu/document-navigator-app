import type { SqlDatabase, SqlExecutor } from './database';
import { matterNumbersOf, toSenderKey } from './matter-numbers';
import { analysisFromJson } from './sql';
import type { DocumentRecord } from './types';

/** The row of `settings` that tells `document_refs` was filled for earlier analyses (SPEC §6.2). */
const BACKFILLED_KEY = 'document_refs_backfilled';

/**
 * Replaces a document's numbers with those of `analysis` (LINK-1), through `tx`: `document_refs` is
 * derived from the analysis, so it is written in the transaction that writes the analysis.
 */
export async function replaceDocumentRefs(
  tx: SqlExecutor,
  documentId: string,
  analysis: DocumentRecord['analysis']
): Promise<void> {
  await tx.runAsync('DELETE FROM document_refs WHERE document_id = ?', [documentId]);
  if (!analysis) return;
  const senderKey = toSenderKey(analysis.sender?.name);
  for (const { value } of matterNumbersOf(analysis)) {
    await tx.runAsync(
      'INSERT INTO document_refs (document_id, value, sender_key) VALUES (?, ?, ?)',
      [documentId, value, senderKey]
    );
  }
}

/**
 * Fills `document_refs` for the analyses stored before migration 7 (LINK-1): migrations are SQL
 * only, and SQL can't normalize a number. Runs when the database opens and does the work once: a
 * row in `settings` marks it done, in the same transaction. «Delete all data» removes the mark with
 * everything else, and the next run finds nothing to fill.
 */
export async function backfillDocumentRefs(db: SqlDatabase): Promise<void> {
  await db.transaction(async (tx) => {
    const done = await tx.getFirstAsync<{ key: string }>('SELECT key FROM settings WHERE key = ?', [
      BACKFILLED_KEY,
    ]);
    if (done) return;
    const documents = await tx.getAllAsync<{ id: string; analysis: string }>(
      'SELECT id, analysis FROM documents WHERE deleted_at IS NULL AND analysis IS NOT NULL'
    );
    for (const document of documents) {
      await replaceDocumentRefs(tx, document.id, analysisFromJson(document.analysis));
    }
    await tx.runAsync(`INSERT INTO settings (key, value) VALUES (?, 'true')`, [BACKFILLED_KEY]);
  });
}
