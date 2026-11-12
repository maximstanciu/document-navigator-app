import type { TFunction } from 'i18next';

// Flags and names of the languages and countries documents come from (DET-11). Names come from the
// dictionaries rather than `Intl.DisplayNames`, which Hermes wasn't checked for (spike 0.7). A code
// without a name or a flag shows as it is.

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

/** The country whose flag stands for a language. */
const LANGUAGE_FLAGS: Record<Language, Country> = {
  pt: 'PT',
  de: 'DE',
  en: 'GB',
  ru: 'RU',
  uk: 'UA',
  es: 'ES',
  fr: 'FR',
  it: 'IT',
  nl: 'NL',
  pl: 'PL',
  ro: 'RO',
};

// The region of a BCP 47 tag: `BR` in `pt-BR` or `sr-Latn-RS`.
const REGION = /^[a-z]{2,3}(?:-[a-z]{4})?-([a-z]{2})(?:-|$)/i;

/** 🇵🇹 for `PT`: the two regional indicator letters; anything but an alpha-2 code as it is. */
export function countryFlag(code: string): string {
  if (!/^[A-Z]{2}$/.test(code)) return code;
  return String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65));
}

/**
 * 🇵🇹 for `pt`, 🇧🇷 for `pt-BR`; `null` for `und`. A language without a flag and a region shows as
 * its tag.
 */
export function languageFlag(tag: string): string | null {
  const base = tag.split('-')[0].toLowerCase();
  if (base === 'und') return null;
  const region = REGION.exec(tag)?.[1];
  if (region) return countryFlag(region.toUpperCase());
  return LANGUAGES.includes(base as Language) ? countryFlag(LANGUAGE_FLAGS[base as Language]) : tag;
}

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
