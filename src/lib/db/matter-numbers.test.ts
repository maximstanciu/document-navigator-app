import type { KeyFact } from '@/shared/analysis/schema';

import {
  matterNumbersOf,
  normalizeMatterText,
  selectLinks,
  toMatterNumber,
  toSenderKey,
  type MatterRef,
} from './matter-numbers';

describe('normalizeMatterText (LINK-1)', () => {
  it('keeps letters and digits only, in upper case', () => {
    expect(normalizeMatterText('FT 2026/123')).toBe('FT2026123');
    expect(normalizeMatterText('  ft-2026 / 123 ')).toBe('FT2026123');
    expect(normalizeMatterText('Az.: 12 O 345/26')).toBe('AZ12O34526');
  });

  it('applies Unicode NFKC, so look-alike forms of a character match', () => {
    // Full-width digits and letters, a ligature, a non-breaking space.
    expect(normalizeMatterText('ＦＴ２０２６ １２３')).toBe('FT2026123');
    expect(normalizeMatterText('ﬁle 2026')).toBe('FILE2026');
  });

  it('keeps letters of any script', () => {
    expect(normalizeMatterText('Дело 2-1234/2026')).toBe('ДЕЛО212342026');
  });
});

describe('toMatterNumber (LINK-1)', () => {
  it('normalizes a number', () => {
    expect(toMatterNumber('FT 2026/123')).toBe('FT2026123');
    expect(toMatterNumber('100 245 778')).toBe('100245778');
  });

  it('refuses a value shorter than 6 characters after normalization', () => {
    expect(toMatterNumber('A-12/3')).toBeNull();
    expect(toMatterNumber('12 34 5')).toBeNull();
    expect(toMatterNumber('12 34 56')).toBe('123456');
  });

  it('refuses a value without a digit', () => {
    expect(toMatterNumber('Kindergeld')).toBeNull();
    expect(toMatterNumber('см. договор')).toBeNull();
  });
});

describe('toSenderKey (LINK-2)', () => {
  it('tells senders apart by name, whatever its case, spaces and punctuation', () => {
    expect(toSenderKey('EDP Comercial, S.A.')).toBe('EDPCOMERCIALSA');
    expect(toSenderKey('edp  comercial s.a.')).toBe('EDPCOMERCIALSA');
  });

  it('is null without a name', () => {
    expect(toSenderKey(null)).toBeNull();
    expect(toSenderKey(undefined)).toBeNull();
    expect(toSenderKey(' — ')).toBeNull();
  });
});

describe('matterNumbersOf (LINK-1)', () => {
  const fact = (kind: KeyFact['kind'], value: string): KeyFact => ({ kind, label: 'x', value });

  it('takes the reference key facts, as normalized and as written', () => {
    const numbers = matterNumbersOf({
      keyFacts: [
        fact('amount', '84,20 €'),
        fact('reference', ' FT 2026/123 '),
        fact('account', 'PT50 0002 0123 1234 5678 9015 4'),
        fact('reference', 'Contrato 4500-778'),
      ],
    });

    expect(numbers).toEqual([
      { value: 'FT2026123', display: 'FT 2026/123' },
      { value: 'CONTRATO4500778', display: 'Contrato 4500-778' },
    ]);
  });

  it('lists a number once, as first written, and skips what is not a number', () => {
    const numbers = matterNumbersOf({
      keyFacts: [
        fact('reference', 'FT 2026/123'),
        fact('reference', 'ft-2026-123'),
        fact('reference', 'n/a'),
      ],
    });

    expect(numbers).toEqual([{ value: 'FT2026123', display: 'FT 2026/123' }]);
  });

  it('reads an analysis that lost its shape as one without numbers', () => {
    expect(matterNumbersOf({} as never)).toEqual([]);
    expect(matterNumbersOf({ keyFacts: [null, { kind: 'reference' }] } as never)).toEqual([]);
  });
});

describe('selectLinks (LINK-2)', () => {
  const ref = (documentId: string, value: string, senderKey: string | null): MatterRef => ({
    documentId,
    value,
    senderKey,
  });

  it('links the documents that carry the same number', () => {
    const links = selectLinks('reminder', [
      ref('reminder', 'FT2026123', 'EDP'),
      ref('invoice', 'FT2026123', 'EDP'),
    ]);

    expect([...links]).toEqual([['invoice', 'FT2026123']]);
  });

  it('links across two senders: a company’s invoice and a collector’s letter', () => {
    const links = selectLinks('collector', [
      ref('collector', 'FT2026123', 'INTRUM'),
      ref('invoice', 'FT2026123', 'EDP'),
      ref('reminder', 'FT2026123', 'EDP'),
    ]);

    expect([...links.keys()]).toEqual(['invoice', 'reminder']);
  });

  it('does not link by a number three senders write: it is the person’s own', () => {
    const links = selectLinks('tax', [
      ref('tax', '123456789', 'AT'),
      ref('bank', '123456789', 'CGD'),
      ref('insurer', '123456789', 'FIDELIDADE'),
    ]);

    expect(links.size).toBe(0);
  });

  it('does not count documents without a sender as a sender', () => {
    const links = selectLinks('tax', [
      ref('tax', '123456789', 'AT'),
      ref('bank', '123456789', 'CGD'),
      ref('unknown-1', '123456789', null),
      ref('unknown-2', '123456789', null),
    ]);

    expect([...links.keys()]).toEqual(['bank', 'unknown-1', 'unknown-2']);
  });

  it('still links by another number when one is the person’s own', () => {
    const links = selectLinks('reminder', [
      ref('reminder', '123456789', 'EDP'),
      ref('reminder', 'FT2026123', 'EDP'),
      ref('bank', '123456789', 'CGD'),
      ref('insurer', '123456789', 'FIDELIDADE'),
      ref('invoice', '123456789', 'EDP'),
      ref('invoice', 'FT2026123', 'EDP'),
    ]);

    expect([...links]).toEqual([['invoice', 'FT2026123']]);
  });

  it('gives the shared number that comes first in this document', () => {
    const links = selectLinks('reminder', [
      ref('invoice', 'CONTRATO4500778', 'EDP'),
      ref('invoice', 'FT2026123', 'EDP'),
      ref('reminder', 'FT2026123', 'EDP'),
      ref('reminder', 'CONTRATO4500778', 'EDP'),
    ]);

    expect(links.get('invoice')).toBe('FT2026123');
  });

  it('links nothing for a document without numbers', () => {
    expect(selectLinks('draft', [ref('invoice', 'FT2026123', 'EDP')]).size).toBe(0);
  });
});
