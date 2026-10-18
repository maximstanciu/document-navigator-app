import type { TFunction } from 'i18next';

import type { DocumentStatus } from '@/lib/db/types';
import { formatTimestampDate } from '@/lib/i18n/format';

/** `null` while a PDF hasn't been analyzed yet (D-4): nothing to show. */
export function formatPageCount(pageCount: number | null, t: TFunction) {
  if (pageCount === null) return null;
  return t('documents.pages', { count: pageCount });
}

export function formatStatus(status: DocumentStatus, t: TFunction) {
  return t(`documents.status.${status}`);
}

/** Drafts can have an empty title until the analysis names them. */
export function displayTitle(title: string, t: TFunction) {
  return title.trim() || t('documents.untitled');
}

export function formatMeta(
  document: { createdAt: string; pageCount: number | null; status: DocumentStatus },
  t: TFunction,
  language: string
) {
  return [
    formatTimestampDate(document.createdAt, language),
    formatPageCount(document.pageCount, t),
    formatStatus(document.status, t),
  ]
    .filter(Boolean)
    .join(' · ');
}
