import { useQuery } from '@tanstack/react-query';
import { useLocales } from 'expo-localization';
import { useEffect } from 'react';

import { settingsQuery } from '@/lib/db/settings-query';

import { resolveLanguage } from './language';
import { setLanguage } from './i18n';

/**
 * Keeps the interface language in step with the setting and, for "system", with the device
 * language (Android can change it while the app runs). Mount once, inside the database gate.
 */
export function useLanguageSync() {
  const locales = useLocales();
  const { data: settings } = useQuery(settingsQuery());
  const language = settings ? resolveLanguage(settings.locale, locales) : null;

  useEffect(() => {
    if (language) void setLanguage(language);
  }, [language]);
}
