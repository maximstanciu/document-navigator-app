import { i18n } from '@/lib/i18n/i18n';

import { formatDocumentType } from './format';

const t = i18n.t.bind(i18n);

describe('formatDocumentType', () => {
  it('names a known type and says nothing for «other», «unknown» or none', () => {
    expect(formatDocumentType('invoice', t)).toBe('Invoice');
    expect(formatDocumentType('other', t)).toBeNull();
    expect(formatDocumentType('unknown', t)).toBeNull();
    expect(formatDocumentType(null, t)).toBeNull();
  });
});
