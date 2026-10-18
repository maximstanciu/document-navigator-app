import { ANALYSIS_FIXTURES } from './fixtures';
import {
  ANALYSIS_BOUNDS,
  analysisResultSchema,
  llmAnalysisSchema,
  type AnalysisResult,
} from './schema';

const fixtures = Object.entries(ANALYSIS_FIXTURES);
const { invoice, unreadable } = ANALYSIS_FIXTURES;

function withChanges(changes: Record<string, unknown>): unknown {
  return { ...invoice, ...changes };
}

function withDeadline(changes: Record<string, unknown>): unknown {
  return withChanges({ deadlines: [{ ...invoice.deadlines[0], ...changes }] });
}

describe('analysisResultSchema', () => {
  it.each(fixtures)('accepts the %s fixture', (_name, fixture) => {
    expect(analysisResultSchema.parse(fixture)).toEqual(fixture);
  });

  it.each(fixtures)(
    'links every action of the %s fixture to a deadline in it',
    (_name, fixture) => {
      const deadlineIds = fixture.deadlines.map((deadline) => deadline.id);
      expect(new Set(deadlineIds).size).toBe(deadlineIds.length);
      for (const action of fixture.actions) {
        if (action.deadlineId !== null) expect(deadlineIds).toContain(action.deadlineId);
      }
    }
  );

  it('has fraud signals only in the fraudulent fixture', () => {
    const withSignals = fixtures.filter(([, fixture]) => fixture.fraudSignals.length > 0);
    expect(withSignals.map(([name]) => name)).toEqual(['fraudulentInvoice']);
  });

  it('marks the unreadable fixture as unreadable with nothing extracted', () => {
    expect(unreadable.quality).toEqual({ readable: false, issues: ['blurry', 'dark'] });
    expect([unreadable.deadlines, unreadable.actions, unreadable.risks]).toEqual([[], [], []]);
  });

  it('keeps the bounds the SPEC names', () => {
    expect(ANALYSIS_BOUNDS).toMatchObject({ summary: 600, deadlines: 20, risks: 20 });
  });

  it('rejects a different schema version', () => {
    expect(analysisResultSchema.safeParse(withChanges({ schemaVersion: 2 })).success).toBe(false);
  });

  it('requires null rather than a missing field', () => {
    const { sender: _sender, ...withoutSender } = invoice;
    expect(analysisResultSchema.safeParse(withoutSender).success).toBe(false);
    expect(analysisResultSchema.safeParse(withChanges({ sender: null })).success).toBe(true);
  });

  it.each([
    ['an unknown document type', withChanges({ documentType: 'receipt' })],
    ['a language name instead of a tag', withChanges({ documentLanguage: 'German' })],
    ['a summary over its bound', withChanges({ summary: 'а'.repeat(ANALYSIS_BOUNDS.summary + 1) })],
    [
      'too many deadlines',
      withChanges({ deadlines: Array(ANALYSIS_BOUNDS.deadlines + 1).fill(invoice.deadlines[0]) }),
    ],
    ['a date that is not in the calendar', withDeadline({ date: '2026-02-30' })],
    ['a date in another format', withDeadline({ date: '31.10.2026' })],
    ['a time outside the day', withDeadline({ time: '24:00' })],
    ['a page number of zero', withDeadline({ page: 0 })],
    ['an unknown quality issue', withChanges({ quality: { readable: false, issues: ['torn'] } })],
  ])('rejects %s', (_case, analysis) => {
    expect(analysisResultSchema.safeParse(analysis).success).toBe(false);
  });

  it('accepts a leap day and a deadline time', () => {
    expect(
      analysisResultSchema.safeParse(withDeadline({ date: '2028-02-29', time: '09:30' })).success
    ).toBe(true);
  });
});

describe('llmAnalysisSchema', () => {
  it('is the analysis without the schema version the server adds', () => {
    const { schemaVersion: _version, ...fromModel } = invoice;
    expect(llmAnalysisSchema.parse(fromModel)).toEqual(fromModel);

    const result: AnalysisResult = { schemaVersion: 1, ...llmAnalysisSchema.parse(fromModel) };
    expect(analysisResultSchema.parse(result)).toEqual(invoice);
  });
});
