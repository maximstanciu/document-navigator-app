import { i18n } from '@/lib/i18n/i18n';

// Tests query English text; a test that needs Russian switches with `i18n.changeLanguage('ru')`.
beforeEach(async () => {
  await i18n.changeLanguage('en');
});
