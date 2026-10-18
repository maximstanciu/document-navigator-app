import { resolveLanguage } from './language';

describe('resolveLanguage (SET-1)', () => {
  it('uses an explicit choice regardless of the device', () => {
    expect(resolveLanguage('ru', [{ languageCode: 'en' }])).toBe('ru');
    expect(resolveLanguage('en', [{ languageCode: 'ru' }])).toBe('en');
  });

  it('takes the first supported device language for "system"', () => {
    expect(
      resolveLanguage('system', [
        { languageCode: 'de' },
        { languageCode: 'ru' },
        { languageCode: 'en' },
      ])
    ).toBe('ru');
    expect(resolveLanguage('system', [{ languageCode: 'en' }, { languageCode: 'ru' }])).toBe('en');
  });

  it('falls back to English when no device language is supported', () => {
    expect(resolveLanguage('system', [{ languageCode: 'uk' }, { languageCode: null }])).toBe('en');
    expect(resolveLanguage('system', [])).toBe('en');
  });
});
