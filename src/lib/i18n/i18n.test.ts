import { act, renderHook } from '@testing-library/react-native';
import { useTranslation } from 'react-i18next';

import appConfig from '../../../app.json';
import type { TranslationTree } from './translation-tree';
import { i18n } from './i18n';
import { APP_LANGUAGES } from './language';
import enNative from './native/en.json';
import ruNative from './native/ru.json';
import { en } from './resources/en';
import { ru } from './resources/ru';

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;

function flatten(tree: TranslationTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [`${prefix}${key}`] : flatten(value, `${prefix}${key}.`)
  );
}

function pluralForms(keys: string[], base: string) {
  return keys
    .filter((key) => key.replace(PLURAL_SUFFIX, '') === base && PLURAL_SUFFIX.test(key))
    .map((key) => key.match(PLURAL_SUFFIX)?.[1])
    .sort();
}

describe('i18n setup (1.1)', () => {
  it('uses the formatjs PluralRules polyfill, as on Hermes', () => {
    expect((Intl.PluralRules as unknown as { polyfilled?: boolean }).polyfilled).toBe(true);
  });

  it.each([
    [1, '1 страница'],
    [2, '2 страницы'],
    [4, '4 страницы'],
    [5, '5 страниц'],
    [11, '11 страниц'],
    [12, '12 страниц'],
    [21, '21 страница'],
    [22, '22 страницы'],
    [25, '25 страниц'],
    [0, '0 страниц'],
    [1.5, '1.5 страницы'],
  ])('Russian plural for %s → "%s"', (count, expected) => {
    expect(i18n.getFixedT('ru')('documents.pages', { count })).toBe(expected);
  });

  it.each([
    [1, '1 page'],
    [2, '2 pages'],
    [0, '0 pages'],
  ])('English plural for %s → "%s"', (count, expected) => {
    expect(i18n.getFixedT('en')('documents.pages', { count })).toBe(expected);
  });

  it('has the same keys in both dictionaries, with each language’s plural forms', () => {
    const ruKeys = flatten(ru);
    const enKeys = flatten(en);
    const base = (keys: string[]) =>
      [...new Set(keys.map((key) => key.replace(PLURAL_SUFFIX, '')))].sort();

    expect(base(enKeys)).toEqual(base(ruKeys));
    for (const key of base(ruKeys).filter((k) =>
      ruKeys.some((r) => r !== k && r.replace(PLURAL_SUFFIX, '') === k)
    )) {
      expect(pluralForms(ruKeys, key)).toEqual(['few', 'many', 'one', 'other']);
      expect(pluralForms(enKeys, key)).toEqual(['one', 'other']);
    }
  });

  it('declares the app languages to the OS, with the same native strings in each', () => {
    const { locales, plugins } = appConfig.expo;
    const localization = plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'expo-localization'
    );

    expect(Object.keys(locales).sort()).toEqual([...APP_LANGUAGES].sort());
    expect(localization?.[1]).toMatchObject({ supportedLocales: [...APP_LANGUAGES] });
    expect(Object.keys(ruNative.ios).sort()).toEqual(Object.keys(enNative.ios).sort());
  });

  it('re-renders useTranslation users when the language changes', async () => {
    const { result } = await renderHook(() => useTranslation());
    expect(result.current.t('tabs.documents')).toBe('Documents');

    await act(async () => {
      await i18n.changeLanguage('ru');
    });

    expect(result.current.t('tabs.documents')).toBe('Документы');
    expect(result.current.i18n.language).toBe('ru');
  });
});
