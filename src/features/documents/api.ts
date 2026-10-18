import { getRepositories } from '@/lib/db/repositories';
import type { DocumentRecord } from '@/lib/db/types';

import type { DocumentDetail, DocumentSummary } from './types';

/**
 * Data access for the documents feature: reads local documents through the repositories in
 * `src/lib/db`, no React. Query hooks in `./queries.ts` wrap these functions.
 */

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    senderName: document.senderName,
    pageCount: document.pageCount,
    createdAt: document.createdAt,
  };
}

/** Active documents, newest first (HOME-2). */
export async function listDocuments(): Promise<DocumentSummary[]> {
  const documents = await getRepositories().documents.list();
  return documents.map(toSummary);
}

/** `null` when the document doesn't exist or was deleted. */
export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const document = await getRepositories().documents.get(id);
  if (!document) return null;
  return {
    ...toSummary(document),
    documentDate: document.documentDate,
    analyzedAt: document.analyzedAt,
    mimeType: document.mimeType,
    errorCode: document.errorCode,
  };
}
