import './polyfills';

import { getLocales } from 'expo-localization';
import { createInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';

import { getRepositories } from '@/lib/db/repositories';

import { APP_LANGUAGES, resolveLanguage, type AppLanguage } from './language';
import { en } from './resources/en';
import { ru } from './resources/ru';

/**
 * The app's i18next instance, initialized synchronously on import in the device language. The stored
 * setting is applied by `applyStoredLanguage()` once the database is open (DatabaseGate), before the
 * splash screen hides. `initReactI18next` makes it the instance `useTranslation()` uses.
 */
export const i18n = createInstance();

i18n.use(initReactI18next).init({
  resources: { ru: { translation: ru }, en: { translation: en } },
  lng: resolveLanguage('system', getLocales()),
  fallbackLng: 'en',
  supportedLngs: [...APP_LANGUAGES],
  interpolation: { escapeValue: false }, // React escapes text itself
  initAsync: false,
});

export function currentLanguage(): AppLanguage {
  return i18n.language === 'ru' ? 'ru' : 'en';
}

export async function setLanguage(language: AppLanguage): Promise<void> {
  if (i18n.language !== language) await i18n.changeLanguage(language);
}

/** Applies the interface language from settings (SET-1). Needs the open database. */
export async function applyStoredLanguage(): Promise<void> {
  const { locale } = await getRepositories().settings.get();
  await setLanguage(resolveLanguage(locale, getLocales()));
}
