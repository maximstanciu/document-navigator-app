import type { DocumentSummary } from './types';

/**
 * Out of sight: the document is in the archive itself (HOME-6) or with its case (CASE-6). Such a
 * document leaves «All documents», the type filter, «Choose from documents» and the warnings in
 * «Needs attention»; search still finds it and its deadlines stay live.
 */
export function isArchived(document: Pick<DocumentSummary, 'archivedAt' | 'caseArchived'>) {
  return document.archivedAt !== null || document.caseArchived;
}

/** Documents archived themselves, the most recently archived first (HOME-6). */
export function archivedDocuments(documents: readonly DocumentSummary[]): DocumentSummary[] {
  return documents
    .filter((document) => document.archivedAt !== null)
    .sort((a, b) => ((a.archivedAt ?? '') < (b.archivedAt ?? '') ? 1 : -1));
}
