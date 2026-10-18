import type { AnalysisResult } from '@/shared/analysis/schema';

/**
 * Search normalization (HOME-3). SQLite's LIKE ignores case only for ASCII, so the `search_text`
 * column and the query are both lower-cased in JS. «ё» is folded into «е» because people rarely type it.
 */
export function normalizeForSearch(value: string): string {
  return value.toLocaleLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

/** Collects the searchable parts of a document: title, sender, summary and key fact values. */
export function buildSearchText(parts: readonly (string | null | undefined)[]): string {
  return normalizeForSearch(parts.filter((part): part is string => Boolean(part)).join(' '));
}

/** The searchable parts of an analysis: its summary and the values of its key facts. */
export function searchablePartsOfAnalysis(analysis: AnalysisResult | null): string[] {
  if (!analysis) return [];
  return [analysis.summary, ...analysis.keyFacts.map((fact) => fact.value)];
}
