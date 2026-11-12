import { countryFlag, languageFlag } from './display-names';

describe('countryFlag', () => {
  it('turns an alpha-2 code into its flag, with or without a name in the dictionary', () => {
    expect(countryFlag('PT')).toBe('🇵🇹');
    expect(countryFlag('SE')).toBe('🇸🇪');
  });

  it('leaves anything else as it is', () => {
    expect(countryFlag('pt')).toBe('pt');
    expect(countryFlag('PRT')).toBe('PRT');
  });
});

describe('languageFlag', () => {
  it('shows a language by the flag of its country', () => {
    expect(languageFlag('pt')).toBe('🇵🇹');
    expect(languageFlag('en')).toBe('🇬🇧');
    expect(languageFlag('uk')).toBe('🇺🇦');
    expect(languageFlag('DE')).toBe('🇩🇪');
  });

  it('takes the region of the tag when it has one', () => {
    expect(languageFlag('pt-BR')).toBe('🇧🇷');
    expect(languageFlag('en-us')).toBe('🇺🇸');
    expect(languageFlag('sr-Latn-RS')).toBe('🇷🇸');
    expect(languageFlag('de-CH-1996')).toBe('🇨🇭');
  });

  it('shows nothing for an unknown language and the tag of a language without a flag', () => {
    expect(languageFlag('und')).toBeNull();
    expect(languageFlag('sv')).toBe('sv');
    expect(languageFlag('zh-Hant')).toBe('zh-Hant');
  });
});
