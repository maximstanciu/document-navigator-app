/**
 * Languages the analysis can be explained in (D-5, SET-1). The server accepts only these as `locale`
 * (SPEC §7.2). A new one is added only after a run on the eval set (SPEC §7.6); no right-to-left scripts.
 */
export const EXPLANATION_LOCALES = ['ru', 'en'] as const;

export type ExplanationLocale = (typeof EXPLANATION_LOCALES)[number];

export function isExplanationLocale(value: unknown): value is ExplanationLocale {
  return EXPLANATION_LOCALES.includes(value as ExplanationLocale);
}
