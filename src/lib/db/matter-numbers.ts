import type { AnalysisResult } from '@/shared/analysis/schema';

// Related documents (SPEC §4.10): the numbers a document carries and the rule that links two
// documents by one. Pure functions; the rows live in `document_refs`.

/** A number is at least this long after normalization (LINK-1). */
export const MIN_MATTER_NUMBER_LENGTH = 6;

/**
 * A number in the documents of this many different senders is the person's own (a tax, social
 * security or customer number), not a matter's, and links nothing (LINK-2).
 */
export const OWN_NUMBER_SENDERS = 3;

/** LINK-1: Unicode NFKC, upper case, letters and digits only — «FT 2026/123» → `FT2026123`. */
export function normalizeMatterText(text: string): string {
  return text
    .normalize('NFKC')
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]/gu, '');
}

/**
 * The number written as `value`, normalized, or `null` when it isn't one: shorter than
 * `MIN_MATTER_NUMBER_LENGTH` or without a digit (LINK-1).
 */
export function toMatterNumber(value: string): string | null {
  const normalized = normalizeMatterText(value);
  return normalized.length >= MIN_MATTER_NUMBER_LENGTH && /\p{Nd}/u.test(normalized)
    ? normalized
    : null;
}

/** A sender's name as senders are told apart (LINK-2); `null` for none. */
export function toSenderKey(name: string | null | undefined): string | null {
  return normalizeMatterText(name ?? '') || null;
}

/** A number of a document: normalized, and as the document writes it. */
export type MatterNumber = { value: string; display: string };

/**
 * The numbers of an analysis (LINK-1): its key facts of the kind `reference`, each number once, in
 * the order of the analysis. Facts of the kind `account` are left out: an authority has one account
 * for everyone who pays it, and it would link all of its letters.
 */
export function matterNumbersOf(analysis: Pick<AnalysisResult, 'keyFacts'>): MatterNumber[] {
  const numbers = new Map<string, MatterNumber>();
  // An analysis read back from the database is not validated again: take only what has the shape.
  const facts: readonly Partial<AnalysisResult['keyFacts'][number]>[] = Array.isArray(
    analysis.keyFacts
  )
    ? analysis.keyFacts
    : [];
  for (const fact of facts) {
    if (fact?.kind !== 'reference' || typeof fact.value !== 'string') continue;
    const value = toMatterNumber(fact.value);
    if (value && !numbers.has(value)) numbers.set(value, { value, display: fact.value.trim() });
  }
  return [...numbers.values()];
}

/** A row of `document_refs`: a document carries the number `value`, sent by `senderKey`. */
export type MatterRef = { documentId: string; value: string; senderKey: string | null };

/**
 * LINK-2: the documents linked to `documentId`, each with the number it shares with it. `refs` are
 * the rows of every document, this one included, that carries one of this document's numbers. A
 * number in the documents of `OWN_NUMBER_SENDERS` or more different senders links nothing; documents
 * without a sender don't count as one. Of several shared numbers, the one that comes first in this
 * document's rows is given.
 */
export function selectLinks(documentId: string, refs: readonly MatterRef[]): Map<string, string> {
  const byValue = new Map<string, MatterRef[]>();
  for (const ref of refs) {
    const rows = byValue.get(ref.value);
    if (rows) rows.push(ref);
    else byValue.set(ref.value, [ref]);
  }

  const links = new Map<string, string>();
  for (const own of refs) {
    if (own.documentId !== documentId) continue;
    const rows = byValue.get(own.value) ?? [];
    const senders = new Set(rows.map((row) => row.senderKey).filter((key) => key !== null));
    if (senders.size >= OWN_NUMBER_SENDERS) continue;
    for (const row of rows) {
      if (row.documentId !== documentId && !links.has(row.documentId)) {
        links.set(row.documentId, own.value);
      }
    }
  }
  return links;
}
