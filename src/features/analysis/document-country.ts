import type { Settings } from '@/lib/db/types';
import { isMemoCountry, type MemoCountry } from '@/shared/legal-memo-countries';

/** «Country of documents» (SET-6) or the country picked for one analysis (DET-9). */
export type DocumentCountryChoice = MemoCountry | 'other';

/**
 * The country whose legal memo an upload asks for (ANL-14): the one chosen, none for «Other
 * country», and by default the phone's region if there is a memo for it. The server analyzes again
 * with another memo if the document turns out to be from a country that has one.
 */
export function memoCountryFor(
  choice: Settings['documentCountry'],
  regionCode: string | null
): MemoCountry | null {
  if (choice === 'other') return null;
  if (choice) return choice;
  return isMemoCountry(regionCode) ? regionCode : null;
}
