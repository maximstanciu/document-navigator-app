import { getRepositories } from '@/lib/db/repositories';
import type { DocumentRecord } from '@/lib/db/types';
import { pageFileExists, pageFileUri } from '@/lib/files/page-files';

import type { DocumentDetail, DocumentPage, DocumentSummary } from './types';

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
    documentType: document.documentType,
    documentDate: document.documentDate,
    analyzedAt: document.analyzedAt,
    mimeType: document.mimeType,
    errorCode: document.errorCode,
    fileSize: document.fileSize,
    analysis: document.analysis,
  };
}

/** The pages of the original in order, each with its file or `null` if it is gone (STO-8). */
export async function getDocumentPages(id: string): Promise<DocumentPage[]> {
  const pages = await getRepositories().pages.listByDocument(id);
  return Promise.all(
    pages.map(async (page) => ({
      id: page.id,
      index: page.index,
      uri: (await pageFileExists(page.relativePath)) ? pageFileUri(page.relativePath) : null,
    }))
  );
}

/** The document's deadlines, soonest first, whatever their status (DET-3, DET-4). */
export function listDocumentDeadlines(id: string) {
  return getRepositories().deadlines.list({ documentId: id });
}

/** The document's actions in the order the analysis listed them (DET-3). */
export function listDocumentActions(id: string) {
  return getRepositories().actions.listByDocument(id);
}
