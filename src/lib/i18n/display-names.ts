import type { TFunction } from 'i18next';

// Names of the languages and countries documents come from (DET-11), from the dictionaries rather
// than `Intl.DisplayNames`, which Hermes wasn't checked for (spike 0.7). A code without a name
// shows as it is.

const COUNTRIES = [
  'PT',
  'DE',
  'ES',
  'FR',
  'IT',
  'GB',
  'IE',
  'NL',
  'BE',
  'LU',
  'AT',
  'CH',
  'PL',
  'RO',
  'MD',
  'UA',
  'RU',
  'BR',
  'US',
] as const;

const LANGUAGES = ['pt', 'de', 'en', 'ru', 'uk', 'es', 'fr', 'it', 'nl', 'pl', 'ro'] as const;

type Country = (typeof COUNTRIES)[number];
type Language = (typeof LANGUAGES)[number];

/** «Португалия» for `PT`; an ISO 3166-1 alpha-2 code without a name in the dictionary as it is. */
export function countryName(code: string, t: TFunction): string {
  return COUNTRIES.includes(code as Country) ? t(`countries.${code as Country}`) : code;
}

/**
 * «Португальский» for `pt` or `pt-PT`; `null` for `und`. A language without a name in the
 * dictionary shows as its tag.
 */
export function languageName(tag: string, t: TFunction): string | null {
  const base = tag.split('-')[0].toLowerCase();
  if (base === 'und') return null;
  return LANGUAGES.includes(base as Language) ? t(`languages.${base as Language}`) : tag;
}
