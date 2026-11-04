import type { TFunction } from 'i18next';

import type { DocumentStatus } from '@/lib/db/types';
import { countryName, languageName } from '@/lib/i18n/display-names';
import { formatTimestampDate } from '@/lib/i18n/format';
import type { AnalysisResult, DocumentType } from '@/shared/analysis/schema';
import { isMemoCountry } from '@/shared/legal-memo-countries';

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

/**
 * «Португальский · Португалия · с памяткой по праву Португалии» (DET-11, ANL-14): the document's
 * language and country, and the legal memo its analysis was made with. An analysis stored before
 * SPEC v0.40 has no country and no memo: only its language shows.
 */
export function formatOrigin(
  analysis: Pick<AnalysisResult, 'documentLanguage' | 'documentCountry'>,
  legalMemoCountry: string | null,
  t: TFunction
) {
  const parts = [languageName(analysis.documentLanguage, t)];
  if (analysis.documentCountry !== undefined) {
    if (analysis.documentCountry) parts.push(countryName(analysis.documentCountry, t));
    parts.push(
      isMemoCountry(legalMemoCountry)
        ? t(`documents.origin.memo.${legalMemoCountry}`)
        : t('documents.origin.noMemo')
    );
  }
  return parts.filter(Boolean).join(' · ');
}
