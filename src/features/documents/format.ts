import type { DocumentStatus } from '@/lib/db/types';

// English strings until task 1.1 moves them into the ru/en dictionaries.

export function formatDate(isoDate: string, locale?: string) {
  return new Date(isoDate).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/** `null` while a PDF hasn't been analyzed yet (D-4): nothing to show. */
export function formatPageCount(pageCount: number | null) {
  if (pageCount === null) return null;
  return pageCount === 1 ? '1 page' : `${pageCount} pages`;
}

const STATUS_LABELS: Record<DocumentStatus, string> = {
  draft: 'Not analyzed',
  analyzing: 'Analyzing…',
  ready: 'Analyzed',
  failed: 'Analysis failed',
};

export function formatStatus(status: DocumentStatus) {
  return STATUS_LABELS[status];
}

/** Drafts can have an empty title until the analysis names them. */
export function displayTitle(title: string) {
  return title.trim() || 'Untitled document';
}

export function formatMeta(document: {
  createdAt: string;
  pageCount: number | null;
  status: DocumentStatus;
}) {
  return [
    formatDate(document.createdAt),
    formatPageCount(document.pageCount),
    formatStatus(document.status),
  ]
    .filter(Boolean)
    .join(' · ');
}
