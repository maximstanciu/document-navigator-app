import { getRepositories } from '@/lib/db/repositories';
import type { DocumentRecord } from '@/lib/db/types';
import { deleteDocumentFiles, pageFileExists, pageFileUri } from '@/lib/files/page-files';
import { ANALYSIS_BOUNDS } from '@/shared/analysis/schema';

import type { DeadlineSummary, DocumentDetail, DocumentPage, DocumentSummary } from './types';

/**
 * Data access for the documents feature: reads local documents through the repositories in
 * `src/lib/db`, no React. Query hooks in `./queries.ts` wrap these functions.
 */

function toSummary(document: DocumentRecord): DocumentSummary {
  return {
    id: document.id,
    title: document.title,
    status: document.status,
    documentType: document.documentType,
    senderName: document.senderName,
    pageCount: document.pageCount,
    createdAt: document.createdAt,
    analyzedAt: document.analyzedAt,
    attentionDismissedAt: document.attentionDismissedAt,
    hasFraudSignals: (document.analysis?.fraudSignals.length ?? 0) > 0,
    hasHighRisk: document.analysis?.risks.some((risk) => risk.severity === 'high') ?? false,
  };
}

/** Active documents, newest first (HOME-2). */
export async function listDocuments(): Promise<DocumentSummary[]> {
  const documents = await getRepositories().documents.list();
  return documents.map(toSummary);
}

/**
 * Documents whose title, sender, summary or key facts contain `query`, in any case, newest first
 * (HOME-3). An empty query finds nothing.
 */
export async function searchDocuments(query: string): Promise<DocumentSummary[]> {
  const documents = await getRepositories().documents.search(query);
  return documents.map(toSummary);
}

/** Open deadlines of all documents, soonest first: for the cards and «Needs attention» (HOME-1, HOME-2). */
export async function listOpenDeadlines(): Promise<DeadlineSummary[]> {
  const deadlines = await getRepositories().deadlines.list({ statuses: ['open'] });
  return deadlines.map(({ id, documentId, description, dueDate, dueTime }) => ({
    id,
    documentId,
    description,
    dueDate,
    dueTime,
  }));
}

/** «Got it» in «Needs attention»: the document's fraud signs or high risk are seen (HOME-1). */
export async function dismissAttention(id: string): Promise<void> {
  await getRepositories().documents.dismissAttention(id);
}

/** «Rename» (DET-9): a blank title is refused; a new analysis keeps the title (ANL-8). */
export async function renameDocument(id: string, title: string): Promise<void> {
  const trimmed = title.trim().slice(0, ANALYSIS_BOUNDS.title);
  if (!trimmed) throw new Error('A document needs a title');
  await getRepositories().documents.update(id, { title: trimmed });
}

/**
 * «Delete» (DET-9, STO-6): the content is wiped in the database at once and the page files go with
 * the document's folder. Cancelling its reminders in the OS arrives with the notifications adapter
 * (task 5.1); before it nothing is scheduled.
 */
export async function deleteDocument(id: string): Promise<void> {
  const removed = await getRepositories().documents.remove(id);
  if (removed) await deleteDocumentFiles(id);
}

/** `null` when the document doesn't exist or was deleted. */
export async function getDocument(id: string): Promise<DocumentDetail | null> {
  const document = await getRepositories().documents.get(id);
  if (!document) return null;
  return {
    ...toSummary(document),
    documentDate: document.documentDate,
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
