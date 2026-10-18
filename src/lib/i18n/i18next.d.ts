import 'i18next';

import type { ru } from './resources/ru';

// Typed keys: t('documents.title') is checked against the Russian source dictionary.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof ru };
  }
}
