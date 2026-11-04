/**
 * Countries the server has a legal memo for (SPEC §7.4 rule 11, ANL-14, D-7), ISO 3166-1 alpha-2.
 * Portugal is the launch country. A new country comes with its memo, reviewed by a lawyer (SPEC
 * §11.2, question 13), and its documents in the eval set (SPEC §7.6).
 */
export const MEMO_COUNTRIES = ['PT', 'DE'] as const;

export type MemoCountry = (typeof MEMO_COUNTRIES)[number];

export function isMemoCountry(value: unknown): value is MemoCountry {
  return MEMO_COUNTRIES.includes(value as MemoCountry);
}

/** An ISO 3166-1 alpha-2 country code, upper case. */
export const COUNTRY_CODE = /^[A-Z]{2}$/;

/** An ISO 3166-1 alpha-2 code as the API carries it: two Latin letters, upper case. */
export function isCountryCode(value: unknown): value is string {
  return typeof value === 'string' && COUNTRY_CODE.test(value);
}

/**
 * The memo to analyze the document again with (ANL-14): the country the model found, when it has a
 * memo and isn't the one the analysis already used; else `null`.
 */
export function memoCountryToRetry(
  used: MemoCountry | null,
  found: string | null | undefined
): MemoCountry | null {
  return isMemoCountry(found) && found !== used ? found : null;
}
