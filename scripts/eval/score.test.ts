import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisDeadline, AnalysisResult } from '@/shared/analysis/schema';

import type { AnalysisExpectation, ExpectedDeadline } from './labels';
import { scoreCase, similarQuote, type CaseRun } from './score';

const invoice = ANALYSIS_FIXTURES.invoice;

function runOf(analysis: AnalysisResult, pageCount = 2): CaseRun {
  return {
    id: 'invoices-01',
    provider: 'mock',
    locale: 'ru',
    startedAt: '2026-11-01T10:00:00.000Z',
    ms: 1000,
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0,
    retried: false,
    pageCount,
    outcome: { kind: 'analysis', analysis, raw: null },
  };
}

function label(overrides: Partial<ExpectedDeadline> = {}): ExpectedDeadline {
  return {
    label: 'Pay the bill',
    required: true,
    kind: ['payment'],
    date: '2026-10-31',
    toleranceDays: 0,
    time: null,
    dateSource: 'explicit',
    quote: 'Rechnungsbetrag von 84,20 € bis zum 31.10.2026',
    page: 1,
    ...overrides,
  };
}

function answer(overrides: Partial<AnalysisDeadline> = {}): AnalysisDeadline {
  return { ...invoice.deadlines[0], ...overrides };
}

const matchingExpectation: AnalysisExpectation = {
  outcome: 'analysis',
  pageCount: 2,
  documentType: 'invoice',
  documentLanguage: 'de-DE',
  documentDate: '2026-10-03',
  sender: { name: 'Stadtwerke Musterstadt', kind: 'company' },
  quality: { readable: true },
  deadlines: [label({ linkedActionsMin: 1 })],
  risks: [
    {
      label: 'Late fee',
      required: true,
      severity: ['medium', 'low'],
      quote: 'Mahngebühr von 5,00 €',
      page: 2,
    },
  ],
  keyFacts: [
    { kind: 'amount', value: '84,20 EUR', required: true, page: 1 },
    { kind: 'reference', value: '100245778', required: true, page: 1 },
  ],
  fraudSignals: { max: 0 },
};

describe('scoreCase', () => {
  it('finds everything in an answer that matches its labels', () => {
    const score = scoreCase(matchingExpectation, runOf(invoice));

    expect(score.failed).toBeNull();
    expect(Object.values(score.fields).every(Boolean)).toBe(true);
    expect(score.deadlines).toMatchObject({ required: 1, found: 1, missed: [], extra: [] });
    expect(score.deadlines.matches).toEqual([
      expect.objectContaining({
        offsetDays: 0,
        dateSourceOk: true,
        timeOk: true,
        quoteOk: true,
        linkedActionsOk: true,
      }),
    ]);
    expect(score.risks).toEqual({ required: 1, found: 1, severityOk: 1, missed: [] });
    expect(score.keyFacts).toEqual({ required: 2, found: 2, missed: [] });
    expect(score.fraud).toEqual({ fraudulent: false, min: 0, count: 0 });
  });

  it('pairs a computed date within the tolerance and records how late it is', () => {
    const expectation = {
      ...matchingExpectation,
      deadlines: [label({ dateSource: 'computed', date: '2026-10-29', toleranceDays: 3 })],
    };

    const { deadlines } = scoreCase(expectation, runOf(invoice));

    expect(deadlines.found).toBe(1);
    expect(deadlines.matches[0]).toMatchObject({ offsetDays: 2, dateSourceOk: false });
  });

  it('calls a deadline outside the tolerance invented and the label missed', () => {
    const expectation = { ...matchingExpectation, deadlines: [label({ date: '2026-11-15' })] };

    const { deadlines } = scoreCase(expectation, runOf(invoice));

    expect(deadlines).toMatchObject({ found: 0, missed: ['Pay the bill'], matches: [] });
    expect(deadlines.extra).toEqual([
      expect.objectContaining({ date: '2026-10-31', verdict: 'invented', forbidden: null }),
    ]);
  });

  it('tells a wrong kind on a reference date and a duplicate from an invented deadline', () => {
    const expectation = {
      ...matchingExpectation,
      deadlines: [label(), label({ label: 'Object', kind: ['response'], date: '2026-11-30' })],
    };
    const analysis = {
      ...invoice,
      deadlines: [
        answer(),
        answer({ id: 'd2', date: '2026-10-31' }),
        answer({ id: 'd3', kind: 'other', date: '2026-11-30' }),
      ],
    };

    const { deadlines } = scoreCase(expectation, runOf(analysis));

    expect(deadlines.missed).toEqual(['Object']);
    expect(deadlines.extra.map((deadline) => deadline.verdict)).toEqual([
      'duplicate',
      'wrong_kind',
    ]);
  });

  it('flags a deadline the labels forbid, by date or by quote', () => {
    const expectation: AnalysisExpectation = {
      ...matchingExpectation,
      forbidden: [
        { date: '2008-12-11', quote: 'geboren am 11.12.2008', reason: 'a birth date' },
        { date: null, quote: 'Den genauen Termin teilen wir Ihnen mit', reason: 'no date yet' },
      ],
    };
    const analysis = {
      ...invoice,
      deadlines: [
        answer(),
        answer({
          id: 'd2',
          kind: 'other',
          date: '2008-12-11',
          sourceQuote: 'geboren am 11.12.2008',
        }),
        answer({
          id: 'd3',
          kind: 'appointment',
          date: '2026-12-01',
          sourceQuote: 'Den genauen Termin teilen wir Ihnen rechtzeitig mit.',
        }),
      ],
    };

    const { deadlines } = scoreCase(expectation, runOf(analysis));

    expect(deadlines.extra.map(({ verdict, forbidden }) => [verdict, forbidden])).toEqual([
      ['invented', 'a birth date'],
      ['invented', 'no date yet'],
    ]);
  });

  it('pairs an answer with the required label when an optional one is as close', () => {
    const expectation = {
      ...matchingExpectation,
      deadlines: [
        label({ label: 'Optional', required: false }),
        label({ label: 'Required', required: true }),
      ],
    };

    const { deadlines } = scoreCase(expectation, runOf(invoice));

    expect(deadlines).toMatchObject({ found: 1, missed: [] });
    expect(deadlines.matches.map((match) => match.label)).toEqual(['Required']);
  });

  it('marks wrong fields, missed facts and risks, and fraud signals on an ordinary document', () => {
    const analysis: AnalysisResult = {
      ...invoice,
      documentType: 'letter',
      documentLanguage: 'en',
      sender: null,
      risks: [{ ...invoice.risks[0], severity: 'high', sourceQuote: 'Mahngebühr von 5,00 €' }],
      keyFacts: [],
      fraudSignals: [{ explanation: 'Странный счёт', sourceQuote: null, page: null }],
    };

    const score = scoreCase(matchingExpectation, runOf(analysis, 1));

    expect(score.fields).toMatchObject({
      pageCount: false,
      documentType: false,
      documentLanguage: false,
      senderName: false,
      senderKind: false,
      documentDate: true,
    });
    expect(score.risks).toEqual({ required: 1, found: 1, severityOk: 0, missed: [] });
    expect(score.keyFacts.missed).toEqual(['84,20 EUR', '100245778']);
    expect(score.fraud).toEqual({ fraudulent: false, min: 0, count: 1 });
  });

  it('counts the quality issue the labels ask for', () => {
    const expectation: AnalysisExpectation = {
      outcome: 'analysis',
      quality: { readable: false, issuesAnyOf: ['blurry', 'dark'] },
      deadlines: [],
    };
    const analysis = { ...invoice, quality: { readable: false, issues: ['dark' as const] } };

    expect(scoreCase(expectation, runOf(analysis)).fields).toEqual({
      readable: true,
      qualityIssues: true,
    });
  });

  it('counts everything as missed when there is no analysis', () => {
    const expectation: AnalysisExpectation = {
      ...matchingExpectation,
      fraudSignals: { min: 2, page: 1, signals: ['gift cards', 'threats'] },
    };
    const run: CaseRun = {
      ...runOf(invoice),
      outcome: { kind: 'failed', code: 'unavailable', message: 'The model did not answer.' },
    };

    const score = scoreCase(expectation, run);

    expect(score).toMatchObject({
      failed: 'unavailable',
      fields: {},
      deadlines: { required: 1, found: 0, missed: ['Pay the bill'] },
      risks: { found: 0, missed: ['Late fee'] },
      keyFacts: { found: 0 },
      fraud: { fraudulent: true, min: 2, count: 0 },
    });
  });
});

describe('similarQuote', () => {
  it.each([
    ['spätestens am 30.11.2026', 'Bitte zahlen Sie spätestens am 30.11.2026.'],
    ['innerhalb eines Monats nach Bekanntgabe', 'innerhalb eines\nMonats nach Bekannt-gabe'],
    [
      'Die Frist für die Einlegung des Einspruchs beträgt einen Monat',
      'Einspruchs beträgt einen Monat',
    ],
  ])('takes %j for %j', (labelQuote, answerQuote) => {
    expect(similarQuote(labelQuote, answerQuote)).toBe(true);
  });

  it.each([
    ['spätestens am 30.11.2026', null],
    ['spätestens am 30.11.2026', 'Monat'],
    ['Säumniszuschläge von 1 %', 'Bitte überweisen Sie den Betrag'],
  ])('rejects %j for %j', (labelQuote, answerQuote) => {
    expect(similarQuote(labelQuote, answerQuote)).toBe(false);
  });
});
