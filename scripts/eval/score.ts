import type { AnalysisDeadline, AnalysisResult } from '@/shared/analysis/schema';
import { daysBetween } from '@/shared/calendar-date';

import type { AnalysisExpectation, ExpectedDeadline } from './labels';

// Scores one answer against its labels (scripts/eval/README.md, «Формат labels.json»; SPEC §7.6).

/** What a run saved for one case: the answer after the server's post-processing, or the failure. */
export type CaseRun = {
  id: string;
  provider: string;
  locale: string;
  startedAt: string;
  /** The provider call, PDF rendering included; null if the case failed before it. */
  ms: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number;
  /** The model's first answer didn't fit the schema and it was asked again (SPEC §7.4). */
  retried: boolean;
  /** The memo the analysis ended with and whether it took a second call (ANL-14); absent in older runs. */
  memo?: string | null;
  memoRetried?: boolean;
  pageCount: number;
  outcome:
    | { kind: 'analysis'; analysis: AnalysisResult; raw: unknown }
    | { kind: 'failed'; code: string; message: string; raw?: unknown };
};

export type DeadlineMatch = {
  label: string;
  required: boolean;
  dateSource: ExpectedDeadline['dateSource'];
  expected: string;
  actual: string;
  /** Days from the reference date to the answer's: positive is later. */
  offsetDays: number;
  dateSourceOk: boolean;
  timeOk: boolean;
  quoteOk: boolean;
  /** `linkedActionsMin` met; null where the label sets none. */
  linkedActionsOk: boolean | null;
};

export type ExtraDeadline = {
  kind: AnalysisDeadline['kind'];
  date: string;
  quote: string;
  /**
   * `duplicate`: matches a reference deadline another answer deadline already took; `wrong_kind`:
   * the date fits a reference deadline the answer missed, the kind doesn't; `invented`: neither.
   */
  verdict: 'duplicate' | 'wrong_kind' | 'invented';
  /** Why the labels forbid it, if they do. */
  forbidden: string | null;
};

export type FieldName =
  | 'pageCount'
  | 'documentType'
  | 'documentLanguage'
  | 'documentDate'
  | 'senderName'
  | 'senderKind'
  | 'readable'
  | 'qualityIssues';

export type CaseScore = {
  /** The failure code if there is no analysis; the rest then counts as missed. */
  failed: string | null;
  fields: Partial<Record<FieldName, boolean>>;
  deadlines: {
    required: number;
    found: number;
    missed: string[];
    matches: DeadlineMatch[];
    extra: ExtraDeadline[];
  };
  risks: { required: number; found: number; severityOk: number; missed: string[] };
  keyFacts: { required: number; found: number; missed: string[] };
  /** Null where the labels say nothing about fraud. */
  fraud: { fraudulent: boolean; min: number; count: number } | null;
};

export function scoreCase(expect: AnalysisExpectation, run: CaseRun): CaseScore {
  const analysis = run.outcome.kind === 'analysis' ? run.outcome.analysis : null;
  const expectedDeadlines = expect.deadlines ?? [];
  const required = expectedDeadlines.filter((deadline) => deadline.required);
  const risks = (expect.risks ?? []).filter((risk) => risk.required);
  const facts = (expect.keyFacts ?? []).filter((fact) => fact.required);
  const fraudulent = expect.fraudSignals ? 'min' in expect.fraudSignals : false;
  const fraud = expect.fraudSignals
    ? {
        fraudulent,
        min: 'min' in expect.fraudSignals ? expect.fraudSignals.min : 0,
        count: analysis?.fraudSignals.length ?? 0,
      }
    : null;

  if (!analysis) {
    return {
      failed: run.outcome.kind === 'failed' ? run.outcome.code : 'unknown',
      fields: {},
      deadlines: {
        required: required.length,
        found: 0,
        missed: required.map((deadline) => deadline.label),
        matches: [],
        extra: [],
      },
      risks: { required: risks.length, found: 0, severityOk: 0, missed: risks.map((r) => r.label) },
      keyFacts: { required: facts.length, found: 0, missed: facts.map((fact) => fact.value) },
      fraud,
    };
  }

  const deadlines = scoreDeadlines(expect, analysis);
  const foundRisks = risks.map((risk) => {
    const answers = analysis.risks.filter((answer) => similarQuote(risk.quote, answer.sourceQuote));
    return {
      risk,
      found: answers.length > 0,
      severityOk: answers.some((answer) => risk.severity.includes(answer.severity)),
    };
  });
  const foundFacts = facts.map((fact) => ({
    fact,
    found: analysis.keyFacts.some((answer) => sameValue(fact.value, answer.value)),
  }));

  return {
    failed: null,
    fields: scoreFields(expect, analysis, run.pageCount),
    deadlines: {
      required: required.length,
      found: deadlines.matches.filter((match) => match.required).length,
      missed: required
        .filter((deadline) => !deadlines.matches.some((match) => match.label === deadline.label))
        .map((deadline) => deadline.label),
      ...deadlines,
    },
    risks: {
      required: risks.length,
      found: foundRisks.filter((entry) => entry.found).length,
      severityOk: foundRisks.filter((entry) => entry.severityOk).length,
      missed: foundRisks.filter((entry) => !entry.found).map((entry) => entry.risk.label),
    },
    keyFacts: {
      required: facts.length,
      found: foundFacts.filter((entry) => entry.found).length,
      missed: foundFacts.filter((entry) => !entry.found).map((entry) => entry.fact.value),
    },
    fraud,
  };
}

function scoreFields(
  expect: AnalysisExpectation,
  analysis: AnalysisResult,
  pageCount: number
): CaseScore['fields'] {
  const fields: CaseScore['fields'] = {};
  if (expect.pageCount !== undefined) fields.pageCount = expect.pageCount === pageCount;
  if (expect.documentType !== undefined) {
    fields.documentType = expect.documentType === analysis.documentType;
  }
  if (expect.documentLanguage !== undefined) {
    fields.documentLanguage =
      primaryLanguage(expect.documentLanguage) === primaryLanguage(analysis.documentLanguage);
  }
  if (expect.documentDate !== undefined) {
    fields.documentDate = expect.documentDate === analysis.documentDate;
  }
  if (expect.sender !== undefined) {
    const name = words(expect.sender.name).join(' ');
    const answer = words(analysis.sender?.name ?? '').join(' ');
    fields.senderName = answer !== '' && (answer.includes(name) || name.includes(answer));
    fields.senderKind = expect.sender.kind === analysis.sender?.kind;
  }
  if (expect.quality !== undefined) {
    fields.readable = expect.quality.readable === analysis.quality.readable;
    const anyOf = expect.quality.issuesAnyOf;
    if (anyOf) {
      fields.qualityIssues = analysis.quality.issues.some((issue) => anyOf.includes(issue));
    }
  }
  return fields;
}

/**
 * Pairs answer deadlines with reference deadlines one to one: the kind must be one the label
 * allows and the date within `toleranceDays`. Closer dates pair first, required labels before
 * optional ones at the same distance. What stays unpaired is sorted into `extra`.
 */
function scoreDeadlines(expect: AnalysisExpectation, analysis: AnalysisResult) {
  const expected = expect.deadlines ?? [];
  const actual = analysis.deadlines;
  const fits = (label: ExpectedDeadline, answer: AnalysisDeadline) =>
    Math.abs(daysBetween(label.date, answer.date)) <= label.toleranceDays;

  const pairs: { label: number; answer: number; distance: number }[] = [];
  expected.forEach((label, labelIndex) =>
    actual.forEach((answer, answerIndex) => {
      if (label.kind.includes(answer.kind) && fits(label, answer)) {
        const distance = Math.abs(daysBetween(label.date, answer.date));
        pairs.push({ label: labelIndex, answer: answerIndex, distance });
      }
    })
  );
  pairs.sort(
    (a, b) =>
      a.distance - b.distance ||
      Number(expected[b.label].required) - Number(expected[a.label].required)
  );

  const labelTaken = new Map<number, number>();
  const answerTaken = new Set<number>();
  for (const pair of pairs) {
    if (labelTaken.has(pair.label) || answerTaken.has(pair.answer)) continue;
    labelTaken.set(pair.label, pair.answer);
    answerTaken.add(pair.answer);
  }

  const matches: DeadlineMatch[] = [...labelTaken].map(([labelIndex, answerIndex]) => {
    const label = expected[labelIndex];
    const answer = actual[answerIndex];
    const linked = analysis.actions.filter((action) => action.deadlineId === answer.id).length;
    return {
      label: label.label,
      required: label.required,
      dateSource: label.dateSource,
      expected: label.date,
      actual: answer.date,
      offsetDays: daysBetween(label.date, answer.date),
      dateSourceOk: label.dateSource === answer.dateSource,
      timeOk: label.time === answer.time,
      quoteOk: similarQuote(label.quote, answer.sourceQuote),
      linkedActionsOk:
        label.linkedActionsMin === undefined ? null : linked >= label.linkedActionsMin,
    };
  });

  const extra: ExtraDeadline[] = actual
    .filter((_, index) => !answerTaken.has(index))
    .map((answer) => {
      const fitsTaken = expected.some(
        (label, index) =>
          labelTaken.has(index) && label.kind.includes(answer.kind) && fits(label, answer)
      );
      const fitsMissed = expected.some(
        (label, index) => !labelTaken.has(index) && fits(label, answer)
      );
      const forbidden = (expect.forbidden ?? []).find((rule) =>
        rule.date === null
          ? similarQuote(rule.quote, answer.sourceQuote)
          : rule.date === answer.date
      );
      return {
        kind: answer.kind,
        date: answer.date,
        quote: answer.sourceQuote,
        verdict: fitsTaken ? 'duplicate' : fitsMissed ? 'wrong_kind' : 'invented',
        forbidden: forbidden?.reason ?? null,
      };
    });

  return { matches, extra };
}

/**
 * Whether a quote from the answer is the labelled one: one contains the other, or most of the
 * label's words are in it. Models trim quotes, fix line breaks and hyphenation, so word overlap
 * rather than equality.
 */
export function similarQuote(label: string, answer: string | null): boolean {
  if (!answer) return false;
  const expected = words(label);
  const actual = words(answer);
  if (expected.length === 0 || actual.length === 0) return false;
  const expectedText = expected.join(' ');
  const actualText = actual.join(' ');
  if (actualText.includes(expectedText)) return true;
  if (actual.length >= 3 && expectedText.includes(actualText)) return true;
  const present = new Set(actual);
  return expected.filter((word) => present.has(word)).length / expected.length >= 0.6;
}

/** A key fact "exactly as written", ignoring spaces, case and € written as EUR. */
function sameValue(label: string, answer: string): boolean {
  const normalize = (value: string) =>
    value.normalize('NFKC').toLowerCase().replaceAll('€', 'eur').replace(/\s+/g, '');
  return normalize(answer).includes(normalize(label));
}

function words(text: string): string[] {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

function primaryLanguage(tag: string): string {
  return tag.split('-')[0].toLowerCase();
}
