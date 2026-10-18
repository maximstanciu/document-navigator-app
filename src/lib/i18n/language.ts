import type { InterfaceLocale } from '@/lib/db/types';

export const APP_LANGUAGES = ['ru', 'en'] as const;
export type AppLanguage = (typeof APP_LANGUAGES)[number];

const FALLBACK_LANGUAGE: AppLanguage = 'en';

function isAppLanguage(value: string | null | undefined): value is AppLanguage {
  return APP_LANGUAGES.includes(value as AppLanguage);
}

/**
 * Interface language (SET-1): an explicit choice wins; "system" takes the first supported language
 * from the device's preferred list, otherwise English.
 */
export function resolveLanguage(
  setting: InterfaceLocale,
  deviceLocales: readonly { languageCode: string | null }[]
): AppLanguage {
  if (setting !== 'system') return setting;
  const preferred = deviceLocales.find((locale) => isAppLanguage(locale.languageCode));
  return (preferred?.languageCode as AppLanguage | undefined) ?? FALLBACK_LANGUAGE;
}
