/**
 * Interface languages (SET-1, SPEC §8.5). The app sends its own with an upload as `uiLocale`, and
 * the server writes the push about the finished analysis in it (ANL-12). The app's list is
 * `APP_LANGUAGES` in src/lib/i18n/language.ts; a test there keeps the two equal.
 */
export const UI_LOCALES = ['ru', 'en'] as const;

export type UiLocale = (typeof UI_LOCALES)[number];

export function isUiLocale(value: unknown): value is UiLocale {
  return UI_LOCALES.includes(value as UiLocale);
}
