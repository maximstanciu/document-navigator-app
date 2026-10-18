// Hermes on Android has no Intl.Locale or Intl.PluralRules (spike 0.7, docs/spikes/0.7-platform-apis.md).
// Intl.Locale is polyfilled only where missing (a cheap check); PluralRules is always forced, as the
// formatjs docs recommend for React Native: its feature detection is slow on Android. Load order
// matters: Locale, then PluralRules, then its locale data. Plural data only for the UI languages.
import '@formatjs/intl-locale/polyfill.js';
import '@formatjs/intl-pluralrules/polyfill-force.js';
import '@formatjs/intl-pluralrules/locale-data/en.js';
import '@formatjs/intl-pluralrules/locale-data/ru.js';
