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

  it('reads summary and key fact values from an analysis of any shape', () => {
    expect(
      searchablePartsOfAnalysis({
        summary: 'Оплатить',
        keyFacts: [{ value: 'DE89 3704' }, { value: 42 }, null, { label: 'no value' }],
      })
    ).toEqual(['Оплатить', 'DE89 3704']);
    expect(searchablePartsOfAnalysis(null)).toEqual([]);
    expect(searchablePartsOfAnalysis('text')).toEqual([]);
    expect(searchablePartsOfAnalysis({ summary: 1, keyFacts: 'x' })).toEqual([]);
  });
});
