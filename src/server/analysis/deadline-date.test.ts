import type { DeadlineRule } from '@/shared/analysis/schema';

import { deadlineDate, type DeadlineDateContext } from './deadline-date';

const CONTEXT: DeadlineDateContext = { documentDate: '2026-10-09', today: '2026-10-18' };

/** The model's own date: what a deadline keeps when its rule can't be counted. */
const MODEL_DATE = '2026-12-01';

type Rule = NonNullable<DeadlineRule>;

function rule(changes: Partial<Rule> = {}): Rule {
  return {
    from: 'receipt',
    fromDate: null,
    direction: 'after',
    amount: 2,
    unit: 'week',
    endOf: null,
    ...changes,
  };
}

function computed(
  ruleOrNull: DeadlineRule,
  context: Partial<DeadlineDateContext> = {},
  confidence: 'high' | 'medium' | 'low' = 'medium'
) {
  return deadlineDate(
    { date: MODEL_DATE, dateSource: 'computed', rule: ruleOrNull, confidence },
    { ...CONTEXT, ...context }
  );
}

const dateBy = (changes: Partial<Rule>, context: Partial<DeadlineDateContext> = {}) =>
  computed(rule(changes), context).date;

describe('deadlineDate', () => {
  describe('where the count starts', () => {
    it.each([
      ['document_date', '2026-10-23'],
      ['receipt', '2026-10-23'],
    ] as const)('counts "%s" from the document date', (from, expected) => {
      expect(computed(rule({ from }))).toEqual({ date: expected, confidence: 'medium' });
    });

    it('counts "date_in_text" from the date the text gives', () => {
      expect(
        computed(rule({ from: 'date_in_text', fromDate: '2027-01-31', direction: 'before' }))
      ).toEqual({ date: '2027-01-17', confidence: 'medium' });
    });

    it('ignores a date from the text unless the rule starts from it', () => {
      expect(dateBy({ from: 'receipt', fromDate: '2027-01-31' })).toBe('2026-10-23');
    });

    it.each(['document_date', 'receipt'] as const)(
      'counts "%s" from today with low confidence when the document has no date',
      (from) => {
        expect(computed(rule({ from }), { documentDate: null })).toEqual({
          date: '2026-11-01',
          confidence: 'low',
        });
      }
    );

    it('keeps the confidence of a count from a date in the text without a document date', () => {
      expect(
        computed(rule({ from: 'date_in_text', fromDate: '2026-11-01' }), { documentDate: null })
      ).toEqual({ date: '2026-11-15', confidence: 'medium' });
    });
  });

  describe('days, weeks, months and years', () => {
    it.each([
      ['after', 14, 'day', '2026-10-23'],
      ['before', 14, 'day', '2026-09-25'],
      ['after', 2, 'week', '2026-10-23'],
      ['before', 2, 'week', '2026-09-25'],
      ['after', 1, 'month', '2026-11-09'],
      ['before', 1, 'month', '2026-09-09'],
      ['after', 3, 'month', '2027-01-09'],
      ['before', 10, 'month', '2025-12-09'],
      ['after', 1, 'year', '2027-10-09'],
      ['before', 2, 'year', '2024-10-09'],
    ] as const)('%s %d %s from 2026-10-09 is %s', (direction, amount, unit, expected) => {
      expect(dateBy({ direction, amount, unit })).toBe(expected);
    });

    it.each([
      ['2026-01-31', 'after', 1, 'month', '2026-02-28'],
      ['2028-01-31', 'after', 1, 'month', '2028-02-29'],
      ['2026-08-31', 'after', 1, 'month', '2026-09-30'],
      ['2027-03-31', 'before', 1, 'month', '2027-02-28'],
      ['2027-01-31', 'before', 3, 'month', '2026-10-31'],
      ['2028-02-29', 'after', 1, 'year', '2029-02-28'],
      ['2028-02-29', 'before', 1, 'year', '2027-02-28'],
      ['2028-02-29', 'after', 4, 'year', '2032-02-29'],
      ['2028-02-28', 'after', 1, 'day', '2028-02-29'],
    ] as const)(
      'goes from %s %s %d %s to %s, the last day of a shorter month',
      (fromDate, direction, amount, unit, expected) => {
        expect(dateBy({ from: 'date_in_text', fromDate, direction, amount, unit })).toBe(expected);
      }
    );

    it('counts working days as calendar days and leaves a weekend date where it is', () => {
      // 2026-10-03 + 14 days is a Saturday; by law it often moves to Monday, the app keeps it.
      expect(dateBy({ amount: 14, unit: 'day' }, { documentDate: '2026-10-03' })).toBe(
        '2026-10-17'
      );
    });
  });

  describe('endOf', () => {
    it.each([
      ['month', '2026-11-30'],
      ['quarter', '2026-12-31'],
      ['year', '2026-12-31'],
    ] as const)('moves an "after" date to the end of its %s', (endOf, expected) => {
      expect(dateBy({ amount: 1, unit: 'month', endOf })).toBe(expected);
    });

    it('moves the date after the count, not the start', () => {
      // 2026-09-15 + 1 month = 2026-10-15, whose quarter ends on 2026-12-31.
      expect(
        dateBy({
          from: 'date_in_text',
          fromDate: '2026-09-15',
          amount: 1,
          unit: 'month',
          endOf: 'quarter',
        })
      ).toBe('2026-12-31');
    });

    it('ignores endOf on a "before" rule', () => {
      expect(dateBy({ direction: 'before', amount: 1, unit: 'month', endOf: 'month' })).toBe(
        '2026-09-09'
      );
    });
  });

  describe('a rule without what the count needs', () => {
    it.each([
      ['no rule', null],
      ['no date for "date_in_text"', rule({ from: 'date_in_text', fromDate: null })],
      ['a date not in the calendar', rule({ from: 'date_in_text', fromDate: '2027-02-30' })],
      ['a date in another format', rule({ from: 'date_in_text', fromDate: '31.01.2027' })],
      ['a zero amount', rule({ amount: 0 })],
      ['a negative amount', rule({ amount: -2 })],
      ['a fractional amount', rule({ amount: 1.5 })],
    ])('keeps the model date with low confidence for %s', (_case, ruleOrNull) => {
      expect(computed(ruleOrNull, {}, 'high')).toEqual({ date: MODEL_DATE, confidence: 'low' });
    });
  });

  describe('confidence', () => {
    it.each([
      ['high', 'medium'],
      ['medium', 'medium'],
      ['low', 'low'],
    ] as const)('makes a counted %s date %s', (confidence, expected) => {
      expect(computed(rule(), {}, confidence).confidence).toBe(expected);
    });

    it('keeps the date and confidence of an explicit deadline, rule or not', () => {
      expect(
        deadlineDate(
          { date: MODEL_DATE, dateSource: 'explicit', rule: rule(), confidence: 'high' },
          CONTEXT
        )
      ).toEqual({ date: MODEL_DATE, confidence: 'high' });
    });
  });
});
