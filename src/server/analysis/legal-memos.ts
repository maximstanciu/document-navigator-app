import type { MemoCountry } from '@/shared/legal-memo-countries';

import { LEGAL_MEMO_DE } from './legal-memo-de';
import { LEGAL_MEMO_PT } from './legal-memo-pt';

// The legal memos by country (SPEC §7.4, rule 11; ANL-14, D-7). A memo opens the system prompt of
// the documents from its country; the list of countries is `MEMO_COUNTRIES` in src/shared.

export type LegalMemo = {
  country: MemoCountry;
  /** The country's name in English, for rule 11 of the prompt. */
  countryName: string;
  /** The date of the last change. */
  version: string;
  /** Who reviewed this version and when; `null` while it is a draft (SPEC §11.2, question 13). */
  reviewed: string | null;
  text: string;
};

export const LEGAL_MEMOS: Record<MemoCountry, LegalMemo> = {
  PT: LEGAL_MEMO_PT,
  DE: LEGAL_MEMO_DE,
};
