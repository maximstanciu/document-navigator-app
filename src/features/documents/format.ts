import type { TFunction } from 'i18next';

import type { DocumentStatus } from '@/lib/db/types';
import { formatTimestampDate } from '@/lib/i18n/format';
import type { DocumentType } from '@/shared/analysis/schema';
import { daysBetween } from '@/shared/calendar-date';

/** `null` while a PDF hasn't been analyzed yet (D-4): nothing to show. */
export function formatPageCount(pageCount: number | null, t: TFunction) {
  if (pageCount === null) return null;
  return t('documents.pages', { count: pageCount });
}

export function formatStatus(status: DocumentStatus, t: TFunction) {
  return t(`documents.status.${status}`);
}

/** The type's name, or `null` when it says nothing: not analyzed yet, «other» or «unknown». */
export function formatDocumentType(documentType: DocumentType | null, t: TFunction) {
  if (!documentType || documentType === 'other' || documentType === 'unknown') return null;
  return t(`documents.documentType.${documentType}`);
}

/** How soon an open deadline is due from `today` (HOME-1): overdue, today, tomorrow or in N days. */
export function formatDueIn(dueDate: string, today: string, t: TFunction) {
  const days = daysBetween(today, dueDate);
  if (days < 0) return t('documents.deadline.overdue');
  if (days === 0) return t('documents.attention.today');
  if (days === 1) return t('documents.attention.tomorrow');
  return t('documents.attention.inDays', { count: days });
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
