import { i18n } from '@/lib/i18n/i18n';

import { formatDocumentType, formatOrigin } from './format';

const t = i18n.t.bind(i18n);

describe('formatDocumentType', () => {
  it('names a known type and says nothing for «other», «unknown» or none', () => {
    expect(formatDocumentType('invoice', t)).toBe('Invoice');
    expect(formatDocumentType('other', t)).toBeNull();
    expect(formatDocumentType('unknown', t)).toBeNull();
    expect(formatDocumentType(null, t)).toBeNull();
  });
});

describe('formatOrigin', () => {
  it('shows the flags of the language and the country, one when they match, and names them in the label', () => {
    expect(formatOrigin({ documentLanguage: 'pt', documentCountry: 'PT' }, 'PT', t)).toEqual({
      line: '🇵🇹 · with the guide to Portuguese law',
      label: 'Portuguese · Portugal · with the guide to Portuguese law',
    });
    expect(formatOrigin({ documentLanguage: 'en', documentCountry: 'PT' }, null, t)).toEqual({
      line: '🇬🇧 · 🇵🇹 · without a guide to local law',
      label: 'English · Portugal · without a guide to local law',
    });
  });

  it('leaves out a language and a country the model did not recognize', () => {
    expect(formatOrigin({ documentLanguage: 'und', documentCountry: null }, null, t)).toEqual({
      line: 'without a guide to local law',
      label: 'without a guide to local law',
    });
  });
});
