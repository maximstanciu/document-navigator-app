import { DOCUMENT_TYPES, type DocumentType } from '@/shared/analysis/schema';

import type { DocumentSummary } from './types';

/**
 * A choice in the filter by document type (HOME-4). `unknown` reads «Document» like `other`, so the
 * two are one choice.
 */
export type TypeFilter = Exclude<DocumentType, 'unknown'>;

/** The filter a document falls under; `null` before an analysis has named its type. */
export function typeFilterOf(documentType: DocumentType | null): TypeFilter | null {
  if (documentType === null) return null;
  return documentType === 'unknown' ? 'other' : documentType;
}

/** The types the documents have, in the schema's order: a filter only offers what it can find. */
export function availableTypeFilters(documents: readonly DocumentSummary[]): TypeFilter[] {
  const present = new Set(documents.map((document) => typeFilterOf(document.documentType)));
  return DOCUMENT_TYPES.filter((type): type is TypeFilter => present.has(type as TypeFilter));
}

/** The documents of type `filter`; all of them for `null`. */
export function filterByType<T extends Pick<DocumentSummary, 'documentType'>>(
  documents: readonly T[],
  filter: TypeFilter | null
): T[] {
  if (filter === null) return [...documents];
  return documents.filter((document) => typeFilterOf(document.documentType) === filter);
}
