import type { AnalysisResult } from '@/shared/analysis/schema';

import type { EvalCase } from './labels';
import type { CaseRun, CaseScore, DeadlineMatch, FieldName } from './score';

// Sums up the scored cases by the metrics and thresholds of SPEC §7.6 and writes the report.

export type ScoredCase = { evalCase: EvalCase; run: CaseRun; score: CaseScore };

export type Ratio = { ok: number; total: number };

export type Summary = {
  cases: number;
  /** Cases without an analysis, by failure code. */
  failed: Record<string, number>;
  retried: number;
  /** Required reference deadlines found; those of failed cases count as missed. */
  deadlineRecall: Ratio;
  /** Paired deadlines with exactly the reference date, by the label's `dateSource`. */
  explicitDates: Ratio;
  computedDates: Ratio;
  /** Paired deadlines later than the reference date (SPEC §7.6: none). */
  late: number;
  invented: number;
  wrongKind: number;
  duplicates: number;
  forbidden: number;
  /** Fraudulent documents with at least one fraud signal, and with at least the labelled `min`. */
  fraudFound: Ratio;
  fraudMin: Ratio;
  /** Ordinary documents analyzed with fraud signals. */
  falseFraud: Ratio;
  latencyMs: { p50: number; p95: number; max: number } | null;
  averageTokens: { input: number; output: number } | null;
  costUsd: number;
  fields: Partial<Record<FieldName, Ratio>>;
  keyFacts: Ratio;
  risks: Ratio;
  riskSeverity: Ratio;
  dateSource: Ratio;
  time: Ratio;
  quote: Ratio;
  linkedActions: Ratio;
};

export function summarize(cases: ScoredCase[]): Summary {
  const scores = cases.map((entry) => entry.score);
  const matches = scores.flatMap((score) => score.deadlines.matches);
  const extra = scores.flatMap((score) => score.deadlines.extra);
  const fraudulent = scores.filter((score) => score.fraud?.fraudulent);
  const ordinary = scores.filter(
    (score) => score.fraud && !score.fraud.fraudulent && !score.failed
  );
  const timed = cases.flatMap((entry) => (entry.run.ms === null ? [] : [entry.run.ms]));
  const counted = cases.filter((entry) => entry.run.inputTokens !== null);

  const failed: Record<string, number> = {};
  for (const score of scores)
    if (score.failed) failed[score.failed] = (failed[score.failed] ?? 0) + 1;

  const fields: Summary['fields'] = {};
  for (const score of scores) {
    for (const [name, ok] of Object.entries(score.fields) as [FieldName, boolean][]) {
      const ratio = (fields[name] ??= { ok: 0, total: 0 });
      ratio.total += 1;
      if (ok) ratio.ok += 1;
    }
  }

  return {
    cases: cases.length,
    failed,
    retried: cases.filter((entry) => entry.run.retried).length,
    deadlineRecall: sum(scores, (score) => [score.deadlines.found, score.deadlines.required]),
    explicitDates: exactDates(matches.filter((match) => match.dateSource === 'explicit')),
    computedDates: exactDates(matches.filter((match) => match.dateSource === 'computed')),
    late: matches.filter((match) => match.offsetDays > 0).length,
    invented: extra.filter((deadline) => deadline.verdict === 'invented').length,
    wrongKind: extra.filter((deadline) => deadline.verdict === 'wrong_kind').length,
    duplicates: extra.filter((deadline) => deadline.verdict === 'duplicate').length,
    forbidden: extra.filter((deadline) => deadline.forbidden !== null).length,
    fraudFound: ratio(fraudulent, (score) => score.fraud!.count > 0),
    fraudMin: ratio(fraudulent, (score) => score.fraud!.count >= score.fraud!.min),
    falseFraud: ratio(ordinary, (score) => score.fraud!.count > 0),
    latencyMs:
      timed.length === 0
        ? null
        : { p50: percentile(timed, 0.5), p95: percentile(timed, 0.95), max: Math.max(...timed) },
    averageTokens:
      counted.length === 0
        ? null
        : {
            input: average(counted.map((entry) => entry.run.inputTokens!)),
            output: average(counted.map((entry) => entry.run.outputTokens!)),
          },
    costUsd: cases.reduce((total, entry) => total + entry.run.costUsd, 0),
    fields,
    keyFacts: sum(scores, (score) => [score.keyFacts.found, score.keyFacts.required]),
    risks: sum(scores, (score) => [score.risks.found, score.risks.required]),
    riskSeverity: sum(scores, (score) => [score.risks.severityOk, score.risks.found]),
    dateSource: ratio(matches, (match) => match.dateSourceOk),
    time: ratio(matches, (match) => match.timeOk),
    quote: ratio(matches, (match) => match.quoteOk),
    linkedActions: ratio(
      matches.filter((match) => match.linkedActionsOk !== null),
      (match) => match.linkedActionsOk === true
    ),
  };
}

export type ReportMeta = {
  provider: string;
  locale: string;
  startedAt: string;
  /** Labelled cases rejected before the model, which the run leaves to the smoke test. */
  skipped: number;
  /** Cases selected for the run that have no saved answer yet. */
  pending: number;
};

export function formatReport(meta: ReportMeta, summary: Summary, cases: ScoredCase[]): string {
  const s = summary;
  const failures = Object.entries(s.failed).map(([code, count]) => `${count} ${code}`);
  const days = [...new Set(cases.map((entry) => entry.evalCase.today))].join(', ');
  const lines = [
    `# Eval run: ${meta.provider}`,
    '',
    `- Started ${meta.startedAt}, explanations in \`${meta.locale}\`, labels for today = ${days || '—'}.`,
    `- ${s.cases} cases scored` +
      (meta.pending > 0 ? `, ${meta.pending} not run yet` : '') +
      `; ${meta.skipped} labelled cases are rejected before the model and left to the smoke test.`,
    `- Without an analysis: ${failures.length > 0 ? failures.join(', ') : 'none'}; asked again after an answer outside the schema: ${s.retried}.`,
    '',
    '## SPEC §7.6 thresholds',
    '',
    '| Metric | Result | Target | Met |',
    '| --- | --- | --- | --- |',
    row(
      'Deadline recall (required)',
      formatRatio(s.deadlineRecall),
      '≥ 90%',
      atLeast(s.deadlineRecall, 0.9)
    ),
    row(
      'Date accuracy, explicit',
      formatRatio(s.explicitDates),
      '≥ 95%',
      atLeast(s.explicitDates, 0.95)
    ),
    row(
      'Date accuracy, computed',
      formatRatio(s.computedDates),
      '≥ 95%',
      atLeast(s.computedDates, 0.95)
    ),
    row('Deadlines later than the reference', String(s.late), '0', mark(s.late === 0)),
    row('Invented deadlines', String(s.invented), '0', mark(s.invented === 0)),
    row(
      'Fraud: documents with signals',
      formatRatio(s.fraudFound),
      'all',
      atLeast(s.fraudFound, 1)
    ),
    row('False fraud signals', formatRatio(s.falseFraud), '≤ 5%', atMost(s.falseFraud, 0.05)),
    row(
      'Latency p95 (p50, max)',
      s.latencyMs
        ? `${duration(s.latencyMs.p95)} (${duration(s.latencyMs.p50)}, ${duration(s.latencyMs.max)})`
        : '—',
      '≤ 30 s',
      s.latencyMs ? mark(s.latencyMs.p95 <= 30_000) : '—'
    ),
    row('Cost per document', s.cases > 0 ? `$${(s.costUsd / s.cases).toFixed(4)}` : '—', '—', '—'),
    '',
    'Date accuracy counts paired deadlines only: an answer deadline pairs with a reference one of an',
    'allowed kind within `toleranceDays`. "Later" is later than the reference date of the labels.',
    '',
    '## Other checks',
    '',
    '| Check | Result |',
    '| --- | --- |',
    ...(Object.entries(s.fields) as [FieldName, Ratio][]).map(([name, value]) =>
      row(`Field \`${name}\``, formatRatio(value))
    ),
    row('Key facts (required)', formatRatio(s.keyFacts)),
    row('Risks (required, found by quote)', formatRatio(s.risks)),
    row('Risk severity among those found', formatRatio(s.riskSeverity)),
    row('Paired deadlines: `dateSource`', formatRatio(s.dateSource)),
    row('Paired deadlines: `time`', formatRatio(s.time)),
    row('Paired deadlines: quote', formatRatio(s.quote)),
    row('Paired deadlines: linked actions', formatRatio(s.linkedActions)),
    row('Fraud: at least the labelled number of signals', formatRatio(s.fraudMin)),
    row('Deadlines of the wrong kind on a reference date', String(s.wrongKind)),
    row('Duplicate deadlines', String(s.duplicates)),
    row('Deadlines the labels forbid', String(s.forbidden)),
    s.averageTokens
      ? row(
          'Tokens per document, in / out',
          `${Math.round(s.averageTokens.input)} / ${Math.round(s.averageTokens.output)}`
        )
      : row('Tokens per document', '—'),
    '',
    '## Cases',
    '',
    '| Case | Document | Time | Required deadlines | Invented | Late | Fraud signals | Problem |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...cases.map(({ evalCase, run, score }) =>
      row(
        evalCase.id,
        evalCase.name,
        run.ms === null ? '—' : duration(run.ms),
        `${score.deadlines.found}/${score.deadlines.required}`,
        String(score.deadlines.extra.filter((deadline) => deadline.verdict === 'invented').length),
        String(score.deadlines.matches.filter((match) => match.offsetDays > 0).length),
        score.fraud
          ? `${score.fraud.count}${score.fraud.fraudulent ? ` (≥ ${score.fraud.min})` : ''}`
          : '—',
        score.failed ?? (hasProblems(score) ? 'see below' : '')
      )
    ),
  ];

  const detailed = cases.filter(({ score }) => score.failed || hasProblems(score));
  if (detailed.length > 0) lines.push('', '## Details');
  for (const { evalCase, run, score } of detailed) {
    lines.push('', `### ${evalCase.id}: ${evalCase.name}`, '');
    if (score.failed) {
      const message = run.outcome.kind === 'failed' ? run.outcome.message : '';
      lines.push(`- No analysis: \`${score.failed}\`${message ? `, ${message}` : ''}`);
      continue;
    }
    const wrongFields = Object.entries(score.fields).filter(([, ok]) => !ok);
    if (wrongFields.length > 0) {
      const values = wrongFields.map(([name]) => fieldValue(name as FieldName, evalCase, run));
      lines.push(`- Wrong fields: ${values.join('; ')}`);
    }
    for (const label of score.deadlines.missed) lines.push(`- Missed deadline: ${label}`);
    for (const match of score.deadlines.matches.filter((entry) => entry.offsetDays !== 0)) {
      lines.push(`- ${dateLine(match)}`);
    }
    for (const deadline of score.deadlines.extra) {
      const verdict = { invented: 'Invented', wrong_kind: 'Wrong kind', duplicate: 'Duplicate' };
      lines.push(
        `- ${verdict[deadline.verdict]} deadline: ${deadline.kind} ${deadline.date}, «${clip(deadline.quote)}»` +
          (deadline.forbidden ? ` (forbidden: ${deadline.forbidden})` : '')
      );
    }
    for (const value of score.keyFacts.missed) lines.push(`- Missed key fact: ${value}`);
    for (const label of score.risks.missed) lines.push(`- Missed risk: ${label}`);
    if (score.fraud && !fraudOk(score.fraud)) {
      lines.push(
        `- Fraud signals: ${score.fraud.count}, expected ${score.fraud.fraudulent ? `≥ ${score.fraud.min}` : 'none'}`
      );
    }
  }
  return lines.join('\n') + '\n';
}

function hasProblems(score: CaseScore): boolean {
  return (
    Object.values(score.fields).some((ok) => !ok) ||
    score.deadlines.missed.length > 0 ||
    score.deadlines.matches.some((match) => match.offsetDays !== 0) ||
    score.deadlines.extra.length > 0 ||
    score.keyFacts.missed.length > 0 ||
    score.risks.missed.length > 0 ||
    (score.fraud !== null && !fraudOk(score.fraud))
  );
}

function fraudOk(fraud: NonNullable<CaseScore['fraud']>): boolean {
  return fraud.fraudulent ? fraud.count >= fraud.min : fraud.count === 0;
}

function fieldValue(name: FieldName, evalCase: EvalCase, run: CaseRun): string {
  const expect = evalCase.expect;
  const analysis: AnalysisResult | null =
    run.outcome.kind === 'analysis' ? run.outcome.analysis : null;
  const actual: Record<FieldName, [unknown, unknown]> = {
    pageCount: [expect.pageCount, run.pageCount],
    documentType: [expect.documentType, analysis?.documentType],
    documentLanguage: [expect.documentLanguage, analysis?.documentLanguage],
    documentDate: [expect.documentDate, analysis?.documentDate],
    senderName: [expect.sender?.name, analysis?.sender?.name],
    senderKind: [expect.sender?.kind, analysis?.sender?.kind],
    readable: [expect.quality?.readable, analysis?.quality.readable],
    qualityIssues: [expect.quality?.issuesAnyOf, analysis?.quality.issues],
  };
  const [expected, answer] = actual[name];
  return `${name} ${JSON.stringify(answer ?? null)} instead of ${JSON.stringify(expected ?? null)}`;
}

function dateLine(match: DeadlineMatch): string {
  const sign = match.offsetDays > 0 ? '+' : '';
  const late = match.offsetDays > 0 ? 'Late' : 'Early';
  return `${late} ${match.dateSource} deadline: ${match.label}, ${match.actual} instead of ${match.expected} (${sign}${match.offsetDays} d)`;
}

function exactDates(matches: DeadlineMatch[]): Ratio {
  return ratio(matches, (match) => match.offsetDays === 0);
}

function ratio<T>(items: T[], ok: (item: T) => boolean): Ratio {
  return { ok: items.filter(ok).length, total: items.length };
}

function sum<T>(items: T[], parts: (item: T) => [number, number]): Ratio {
  return items.reduce(
    (total, item) => {
      const [ok, all] = parts(item);
      return { ok: total.ok + ok, total: total.total + all };
    },
    { ok: 0, total: 0 }
  );
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function formatRatio({ ok, total }: Ratio): string {
  return total === 0 ? '—' : `${Math.round((ok / total) * 100)}% (${ok}/${total})`;
}

function atLeast({ ok, total }: Ratio, share: number): string {
  return total === 0 ? '—' : mark(ok / total >= share);
}

function atMost({ ok, total }: Ratio, share: number): string {
  return total === 0 ? '—' : mark(ok / total <= share);
}

function mark(ok: boolean): string {
  return ok ? 'yes' : '**no**';
}

function duration(ms: number): string {
  return ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : `${(ms / 60_000).toFixed(1)} min`;
}

function clip(text: string): string {
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function row(...cells: string[]): string {
  return `| ${cells.map((cell) => cell.replaceAll('|', '\\|').replace(/\s+/g, ' ')).join(' | ')} |`;
}
