import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';

import { buildSearchText, normalizeForSearch, searchablePartsOfAnalysis } from './search-text';

describe('search text (HOME-3)', () => {
  it('lower-cases Cyrillic and Latin, folds ё and collapses spaces', () => {
    expect(normalizeForSearch('  ШТРАФ   за  Парковку\nЁЛКА Straße ')).toBe(
      'штраф за парковку елка straße'
    );
  });

  it('joins only the present parts', () => {
    expect(buildSearchText(['Счёт', null, undefined, '', 'Stadtwerke'])).toBe('счет stadtwerke');
  });

  it('reads the summary and key fact values of an analysis', () => {
    const { invoice } = ANALYSIS_FIXTURES;
    expect(searchablePartsOfAnalysis(invoice)).toEqual([
      invoice.summary,
      '84,20 €',
      '100 245 778',
      'DE89 3704 0044 0532 0130 00',
      '01.09.2026 – 30.09.2026',
    ]);
    expect(searchablePartsOfAnalysis(null)).toEqual([]);
  });
});
