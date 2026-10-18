import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import {
  ANALYSIS_BOUNDS as B,
  llmAnalysisSchema,
  type AnalysisResult,
  type LlmAnalysis,
  type LlmAnalysisShape,
} from '@/shared/analysis/schema';

import { clip, postProcessAnalysis, type PostProcessContext } from './post-process-analysis';

const CONTEXT: PostProcessContext = { today: '2026-10-18', pageCount: 30 };

function fromModel({ schemaVersion: _version, ...analysis }: AnalysisResult): LlmAnalysisShape {
  return structuredClone(analysis);
}

/** The official notice (dated 2026-10-09, two actions on deadline d1) with changes. */
function notice(changes: Partial<LlmAnalysisShape> = {}): LlmAnalysisShape {
  return { ...fromModel(ANALYSIS_FIXTURES.officialNotice), ...changes };
}

type ShapeDeadline = LlmAnalysisShape['deadlines'][number];

function deadline(changes: Partial<ShapeDeadline> = {}): ShapeDeadline {
  return { ...notice().deadlines[0], ...changes };
}

function run(analysis: LlmAnalysisShape, context: Partial<PostProcessContext> = {}): LlmAnalysis {
  const result = postProcessAnalysis(analysis, { ...CONTEXT, ...context });
  // Whatever goes in, what comes out passes the strict schema.
  expect(llmAnalysisSchema.safeParse(result).success).toBe(true);
  return result;
}

const datesOf = (analysis: LlmAnalysis) => analysis.deadlines.map(({ date }) => date);

describe('postProcessAnalysis', () => {
  it.each(Object.entries(ANALYSIS_FIXTURES))('leaves the %s fixture as it is', (_name, fixture) => {
    const { schemaVersion: _version, ...expected } = fixture;
    expect(run(fromModel(fixture))).toEqual(expected);
  });

  describe('dates', () => {
    it('drops deadlines whose date is not in the calendar', () => {
      const deadlines = ['2026-02-30', '31.10.2026', '', '2026-11-06'].map((date) =>
        deadline({ date })
      );
      expect(datesOf(run(notice({ deadlines })))).toEqual(['2026-11-06']);
    });

    it('keeps deadlines from a year before the document date', () => {
      const deadlines = ['2025-10-08', '2025-10-09'].map((date) => deadline({ date }));
      expect(datesOf(run(notice({ documentDate: '2026-10-09', deadlines })))).toEqual([
        '2025-10-09',
      ]);
    });

    it('counts from today when the document has no date', () => {
      const deadlines = ['2025-10-17', '2025-10-18'].map((date) => deadline({ date }));
      expect(datesOf(run(notice({ documentDate: null, deadlines })))).toEqual(['2025-10-18']);
    });

    it('counts from today when the document date is in the future', () => {
      const deadlines = ['2025-10-17', '2025-10-18', '2027-04-01'].map((date) =>
        deadline({ date })
      );
      const result = run(notice({ documentDate: '2027-03-01', deadlines }));
      expect(result.documentDate).toBe('2027-03-01');
      expect(datesOf(result)).toEqual(['2025-10-18', '2027-04-01']);
    });

    it('keeps deadlines up to ten years from today', () => {
      const deadlines = ['2036-10-18', '2036-10-19'].map((date) => deadline({ date }));
      expect(datesOf(run(notice({ deadlines })))).toEqual(['2036-10-18']);
    });

    it('handles a leap-day document date', () => {
      const deadlines = ['2027-02-27', '2027-02-28'].map((date) => deadline({ date }));
      const result = run(notice({ documentDate: '2028-02-29', deadlines }), {
        today: '2028-03-10',
      });
      expect(datesOf(result)).toEqual(['2027-02-28']);
    });

    it.each([
      ['not in the calendar', '2026-13-01'],
      ['in another format', '09.10.2026'],
      ['more than ten years ahead', '2036-10-19'],
    ])('drops a document date %s and counts from today', (_case, documentDate) => {
      const deadlines = ['2025-10-17', '2025-10-18'].map((date) => deadline({ date }));
      const result = run(notice({ documentDate, deadlines }));
      expect(result.documentDate).toBeNull();
      expect(datesOf(result)).toEqual(['2025-10-18']);
    });

    it.each([
      ['09:30', '09:30'],
      ['24:00', null],
      ['9:30', null],
      ['09:30:00', null],
      [null, null],
    ])('keeps the time %p as %p', (time, expected) => {
      expect(run(notice({ deadlines: [deadline({ time })] })).deadlines[0].time).toBe(expected);
    });

    it('never gives a computed date high confidence (SPEC §7.4, rule 3)', () => {
      const deadlines = [
        deadline({ dateSource: 'computed', confidence: 'high' }),
        deadline({ dateSource: 'computed', confidence: 'low' }),
        deadline({ dateSource: 'explicit', confidence: 'high' }),
      ];
      expect(run(notice({ deadlines })).deadlines.map((d) => d.confidence)).toEqual([
        'medium',
        'low',
        'high',
      ]);
    });
  });

  describe('links between actions and deadlines', () => {
    const action = notice().actions[0];

    it('renumbers ids and keeps the links', () => {
      const result = run(
        notice({
          deadlines: [deadline({ id: 'pay' }), deadline({ id: 'reply' })],
          actions: [
            { ...action, id: 'x', deadlineId: 'reply' },
            { ...action, id: 'y', deadlineId: 'pay' },
          ],
        })
      );
      expect(result.deadlines.map((d) => d.id)).toEqual(['d1', 'd2']);
      expect(result.actions.map((a) => [a.id, a.deadlineId])).toEqual([
        ['a1', 'd2'],
        ['a2', 'd1'],
      ]);
    });

    it('unlinks an action from a deadline that was dropped or never existed', () => {
      const result = run(
        notice({
          deadlines: [deadline({ id: 'old', date: '2001-01-01' }), deadline({ id: 'kept' })],
          actions: [
            { ...action, deadlineId: 'old' },
            { ...action, deadlineId: 'missing' },
            { ...action, deadlineId: 'kept' },
          ],
        })
      );
      expect(result.actions.map((a) => a.deadlineId)).toEqual([null, null, 'd1']);
    });

    it('links to the first of two deadlines with the same id', () => {
      const result = run(
        notice({
          deadlines: [deadline({ id: 'd1' }), deadline({ id: 'd1' })],
          actions: [{ ...action, deadlineId: 'd1' }],
        })
      );
      expect(result.deadlines.map((d) => d.id)).toEqual(['d1', 'd2']);
      expect(result.actions[0].deadlineId).toBe('d1');
    });

    it('unlinks actions from deadlines cut over the bound', () => {
      const deadlines = Array.from({ length: B.deadlines + 5 }, (_, i) =>
        deadline({ id: `x${i}` })
      );
      const result = run(
        notice({ deadlines, actions: [{ ...action, deadlineId: `x${B.deadlines}` }] })
      );
      expect(result.deadlines).toHaveLength(B.deadlines);
      expect(result.actions[0].deadlineId).toBeNull();
    });
  });

  it.each([
    [3, 3],
    [4, null],
    [0, null],
    [1.5, null],
    [null, null],
  ])('keeps page %p of a 3-page document as %p', (page, expected) => {
    const base = notice();
    const result = run(
      notice({
        deadlines: [deadline({ page })],
        risks: [{ ...base.risks[0], page }],
        fraudSignals: [{ explanation: 'Срочность', sourceQuote: null, page }],
      }),
      { pageCount: 3 }
    );
    expect([result.deadlines[0].page, result.risks[0].page, result.fraudSignals[0].page]).toEqual([
      expected,
      expected,
      expected,
    ]);
  });

  describe('text', () => {
    it('trims and cuts text to its bound with an ellipsis', () => {
      const summary = `  ${'Длинное объяснение. '.repeat(50)}  `;
      const result = run(notice({ summary, title: ' Письмо из Familienkasse ' }));
      expect(result.title).toBe('Письмо из Familienkasse');
      expect(result.summary).toHaveLength(B.summary);
      expect(result.summary.endsWith('…')).toBe(true);
      expect(summary.trim().startsWith(result.summary.slice(0, -1))).toBe(true);
    });

    it("doesn't cut a character in half", () => {
      const text = `${'а'.repeat(8)}😀😀`;
      expect(clip(text, 10)).toBe(`${'а'.repeat(8)}…`);
      expect(clip(text, 12)).toBe(text);
    });

    it('cuts quotes, explanations and computations too', () => {
      const long = 'x'.repeat(1000);
      const base = notice();
      const result = run(
        notice({
          deadlines: [deadline({ sourceQuote: long, computation: long, description: long })],
          risks: [{ ...base.risks[0], explanation: long, sourceQuote: long, title: long }],
        })
      );
      expect(result.deadlines[0].sourceQuote).toHaveLength(B.quote);
      expect(result.deadlines[0].computation).toHaveLength(B.computation);
      expect(result.risks[0].title).toHaveLength(B.title);
    });

    it('drops a key fact whose value is over the bound rather than cut it', () => {
      const keyFacts = [
        { kind: 'account' as const, label: 'IBAN', value: ' DE89 3704 0044 0532 0130 00 ' },
        { kind: 'other' as const, label: 'Адрес', value: 'x'.repeat(B.factValue + 1) },
        { kind: 'amount' as const, label: 'С'.repeat(B.factLabel + 10), value: '84,20 €' },
      ];
      const result = run(notice({ keyFacts }));
      expect(result.keyFacts.map((fact) => fact.value)).toEqual([
        'DE89 3704 0044 0532 0130 00',
        '84,20 €',
      ]);
      expect(result.keyFacts[1].label).toHaveLength(B.factLabel);
    });

    it.each([
      ['de', 'de'],
      [' pt-BR ', 'pt-BR'],
      ['German', 'und'],
      ['', 'und'],
    ])('keeps the language tag %p as %p', (documentLanguage, expected) => {
      expect(run(notice({ documentLanguage })).documentLanguage).toBe(expected);
    });

    it('drops a sender without a name', () => {
      expect(run(notice({ sender: { name: '  ', kind: 'company' } })).sender).toBeNull();
    });
  });

  describe('lists', () => {
    it('keeps the most severe risks, in their order', () => {
      const base = notice().risks[0];
      const risks = [
        ...Array.from({ length: B.risks }, (_, i) => ({
          ...base,
          severity: 'low' as const,
          title: `low ${i}`,
        })),
        { ...base, severity: 'high' as const, title: 'high' },
        { ...base, severity: 'medium' as const, title: 'medium' },
      ];
      const titles = run(notice({ risks })).risks.map((risk) => risk.title);
      expect(titles).toHaveLength(B.risks);
      expect(titles.slice(-3)).toEqual(['low 17', 'high', 'medium']);
      expect(titles).not.toContain('low 18');
    });

    it('keeps the most urgent actions', () => {
      const base = notice().actions[0];
      const actions = [
        ...Array.from({ length: B.actions }, () => ({ ...base, priority: 'low' as const })),
        { ...base, priority: 'high' as const },
      ];
      const priorities = run(notice({ actions })).actions.map((a) => a.priority);
      expect(priorities).toHaveLength(B.actions);
      expect(priorities.at(-1)).toBe('high');
    });

    it('cuts key facts and fraud signals to their bounds', () => {
      const result = run(
        notice({
          keyFacts: Array.from({ length: B.keyFacts + 3 }, (_, i) => ({
            kind: 'other' as const,
            label: `Факт ${i}`,
            value: String(i),
          })),
          fraudSignals: Array.from({ length: B.fraudSignals + 3 }, () => ({
            explanation: 'Срочность',
            sourceQuote: null,
            page: null,
          })),
        })
      );
      expect(result.keyFacts).toHaveLength(B.keyFacts);
      expect(result.fraudSignals).toHaveLength(B.fraudSignals);
    });

    it('lists each quality issue once', () => {
      const quality = { readable: false, issues: ['blurry', 'dark', 'blurry'] as const };
      expect(run(notice({ quality: { ...quality, issues: [...quality.issues] } })).quality).toEqual(
        {
          readable: false,
          issues: ['blurry', 'dark'],
        }
      );
    });
  });
});
