import { useLanguageSync } from '@/lib/i18n/use-language-sync';

/** Keeps the interface language in step with settings and the device (mounted inside DatabaseGate). */
export function LanguageSync() {
  useLanguageSync();
  return null;
}
