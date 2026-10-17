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

/**
 * Reads `summary` and `keyFacts[].value` from a stored analysis without trusting its shape:
 * the column holds whatever the server returned (SPEC §7.3), validated elsewhere.
 */
export function searchablePartsOfAnalysis(analysis: unknown): string[] {
  if (typeof analysis !== 'object' || analysis === null) return [];
  const { summary, keyFacts } = analysis as { summary?: unknown; keyFacts?: unknown };
  const parts: string[] = [];
  if (typeof summary === 'string') parts.push(summary);
  if (Array.isArray(keyFacts)) {
    for (const fact of keyFacts) {
      const value = (fact as { value?: unknown } | null)?.value;
      if (typeof value === 'string') parts.push(value);
    }
  }
  return parts;
}
