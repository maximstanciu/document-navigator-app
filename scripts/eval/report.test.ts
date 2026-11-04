import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';

import type { AnalysisExpectation, EvalCase } from './labels';
import { percentile, formatReport, summarize, type ScoredCase } from './report';
import { scoreCase, type CaseRun } from './score';

const invoice = ANALYSIS_FIXTURES.invoice;

const expectation: AnalysisExpectation = {
  outcome: 'analysis',
  documentType: 'invoice',
  deadlines: [
    {
      label: 'Pay the bill',
      required: true,
      kind: ['payment'],
      date: '2026-10-30',
      toleranceDays: 2,
      time: null,
      dateSource: 'computed',
      quote: 'bis zum 31.10.2026',
      page: 1,
    },
  ],
  fraudSignals: { max: 0 },
};

function scored(
  id: string,
  outcome: CaseRun['outcome'],
  ms: number | null,
  expect: AnalysisExpectation = expectation
): ScoredCase {
  const evalCase: EvalCase = {
    id,
    name: `${id}-document`,
    files: [],
    today: '2026-11-01',
    timezone: 'Europe/Berlin',
    country: null,
    expect,
  };
  const run: CaseRun = {
    id,
    provider: 'openai-compatible-qwen3.6:35b',
    locale: 'ru',
    startedAt: '2026-11-01T10:00:00.000Z',
    ms,
    inputTokens: ms === null ? null : 4000,
    outputTokens: ms === null ? null : 1000,
    costUsd: 0,
    retried: false,
    pageCount: 1,
    outcome,
  };
  return { evalCase, run, score: scoreCase(expect, run) };
}

const fraudExpectation: AnalysisExpectation = {
  outcome: 'analysis',
  deadlines: [],
  fraudSignals: { min: 1, page: 1, signals: ['gift cards'] },
};

const cases = [
  scored('invoices-01', { kind: 'analysis', analysis: invoice, raw: null }, 240_000),
  scored('invoices-02', { kind: 'failed', code: 'unavailable', message: 'No answer.' }, 300_000),
  scored('fraud-01', { kind: 'analysis', analysis: invoice, raw: null }, 180_000, fraudExpectation),
];

describe('summarize', () => {
  it('sums up the SPEC §7.6 metrics, counting failed cases as missed', () => {
    const summary = summarize(cases);

    expect(summary).toMatchObject({
      cases: 3,
      failed: { unavailable: 1 },
      deadlineRecall: { ok: 1, total: 2 },
      computedDates: { ok: 0, total: 1 },
      explicitDates: { ok: 0, total: 0 },
      late: 1,
      invented: 1, // the invoice deadline on the fraud document
      fraudFound: { ok: 0, total: 1 },
      falseFraud: { ok: 0, total: 1 },
      latencyMs: { p50: 240_000, p95: 300_000, max: 300_000 },
      averageTokens: { input: 4000, output: 1000 },
      fields: { documentType: { ok: 1, total: 1 } },
    });
  });

  it('takes the nearest-rank percentile', () => {
    const values = Array.from({ length: 20 }, (_, index) => index + 1);

    expect(percentile(values, 0.95)).toBe(19);
    expect(percentile(values, 0.5)).toBe(10);
    expect(percentile([7], 0.95)).toBe(7);
  });
});

describe('formatReport', () => {
  it('shows the thresholds and what went wrong in each case', () => {
    const meta = {
      provider: 'openai-compatible-qwen3.6:35b',
      locale: 'ru',
      startedAt: '2026-11-01T10:00:00.000Z',
      skipped: 7,
      pending: 1,
    };

    const report = formatReport(meta, summarize(cases), cases);

    expect(report).toContain('| Deadline recall (required) | 50% (1/2) | ≥ 90% | **no** |');
    expect(report).toContain('| Deadlines later than the reference | 1 | 0 | **no** |');
    expect(report).toContain(
      '| Latency p95 (p50, max) | 5.0 min (4.0 min, 5.0 min) | ≤ 30 s | **no** |'
    );
    expect(report).toContain('3 cases scored, 1 not run yet; 7 labelled cases');
    expect(report).toContain(
      '- Late computed deadline: Pay the bill, 2026-10-31 instead of 2026-10-30 (+1 d)'
    );
    expect(report).toContain('- No analysis: `unavailable`, No answer.');
    expect(report).toContain('- Invented deadline: payment 2026-10-31, «Bitte überweisen');
    expect(report).toContain('- Fraud signals: 0, expected ≥ 1');
  });
});
