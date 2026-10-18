import type { DocumentType } from '@/shared/analysis/schema';

import { availableTypeFilters, filterByType, typeFilterOf } from './type-filter';

const docs = (types: (DocumentType | null)[]) =>
  types.map((documentType, index) => ({ id: `doc-${index}`, documentType }));

describe('type filter (HOME-4)', () => {
  it('treats «unknown» as «other», which both read «Document»', () => {
    expect(typeFilterOf('unknown')).toBe('other');
    expect(typeFilterOf('other')).toBe('other');
    expect(typeFilterOf('fine')).toBe('fine');
    expect(typeFilterOf(null)).toBeNull();
  });

  it('offers each type the documents have once, in the schema’s order, drafts aside', () => {
    const documents = docs(['other', 'fine', null, 'invoice', 'unknown', 'fine']).map(
      (document) => ({
        ...document,
        title: '',
        status: 'ready' as const,
        senderName: null,
        pageCount: 1,
        createdAt: '',
        analyzedAt: null,
        attentionDismissedAt: null,
        hasFraudSignals: false,
        hasHighRisk: false,
      })
    );

    expect(availableTypeFilters(documents)).toEqual(['invoice', 'fine', 'other']);
  });

  it('keeps the documents of the chosen type, or all of them', () => {
    const documents = docs(['invoice', 'unknown', null, 'other']);

    expect(filterByType(documents, 'other').map((d) => d.id)).toEqual(['doc-1', 'doc-3']);
    expect(filterByType(documents, 'invoice').map((d) => d.id)).toEqual(['doc-0']);
    expect(filterByType(documents, null)).toEqual(documents);
  });
});
