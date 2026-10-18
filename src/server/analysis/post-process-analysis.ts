import {
  ANALYSIS_BOUNDS as B,
  LANGUAGE_TAG,
  type Level,
  type LlmAnalysis,
  type LlmAnalysisShape,
} from '@/shared/analysis/schema';
import { addYears, isCalendarDate, isClockTime } from '@/shared/calendar-date';

export type PostProcessContext = {
  /** YYYY-MM-DD on the device (the request's `today`). */
  today: string;
  /** Pages the server counted; a page reference past them is dropped. */
  pageCount: number;
};

/**
 * Repairs what the model got wrong within the right shape, so the result passes
 * `llmAnalysisSchema` (SPEC §7.4). Nothing here is a reason to ask the model again.
 *
 * - Dates: `documentDate` that isn't a calendar date or is more than 10 years ahead becomes `null`.
 *   Deadlines outside `(documentDate ?? today) − 1 year … today + 10 years` are dropped; a document
 *   date in the future anchors the range on `today`. A time that isn't `HH:mm` becomes `null`.
 * - A computed date is never `high` confidence (rule 3).
 * - Ids are renumbered `d1…`, `a1…`; an action whose deadline was dropped or never existed loses
 *   the link and stays as an action without a date.
 * - Page numbers that aren't a page of the document become `null`.
 * - Text is trimmed and cut to its bound with "…". A key fact whose value runs over the bound is
 *   dropped instead: a cut IBAN or amount would be copied as if it were right (DET-6).
 * - Lists are cut to their bounds; risks and actions keep the most important ones.
 */
export function postProcessAnalysis(
  analysis: LlmAnalysisShape,
  { today, pageCount }: PostProcessContext
): LlmAnalysis {
  const latest = addYears(today, 10);
  const documentDate =
    isCalendarDate(analysis.documentDate) && analysis.documentDate <= latest
      ? analysis.documentDate
      : null;
  const earliest = addYears(
    documentDate !== null && documentDate < today ? documentDate : today,
    -1
  );
  const toPage = (page: number | null) =>
    page !== null && Number.isInteger(page) && page >= 1 && page <= pageCount ? page : null;

  const deadlineIds = new Map<string, string>();
  const deadlines = analysis.deadlines
    .filter(({ date }) => isCalendarDate(date) && date >= earliest && date <= latest)
    .slice(0, B.deadlines)
    .map((deadline, index) => {
      const id = `d${index + 1}`;
      if (!deadlineIds.has(deadline.id)) deadlineIds.set(deadline.id, id);
      return {
        id,
        kind: deadline.kind,
        description: clip(deadline.description, B.description),
        date: deadline.date,
        time: isClockTime(deadline.time) ? deadline.time : null,
        dateSource: deadline.dateSource,
        computation: clipOrNull(deadline.computation, B.computation),
        sourceQuote: clip(deadline.sourceQuote, B.quote),
        page: toPage(deadline.page),
        confidence:
          deadline.dateSource === 'computed' && deadline.confidence === 'high'
            ? ('medium' as const)
            : deadline.confidence,
      };
    });

  const actions = mostImportant(analysis.actions, B.actions, (action) => action.priority).map(
    (action, index) => ({
      id: `a${index + 1}`,
      description: clip(action.description, B.description),
      priority: action.priority,
      deadlineId: action.deadlineId === null ? null : (deadlineIds.get(action.deadlineId) ?? null),
    })
  );

  const risks = mostImportant(analysis.risks, B.risks, (risk) => risk.severity).map((risk) => ({
    severity: risk.severity,
    title: clip(risk.title, B.title),
    explanation: clip(risk.explanation, B.explanation),
    sourceQuote: clipOrNull(risk.sourceQuote, B.quote),
    page: toPage(risk.page),
  }));

  const keyFacts = analysis.keyFacts
    .map((fact) => ({ ...fact, value: fact.value.trim() }))
    .filter((fact) => fact.value.length <= B.factValue)
    .slice(0, B.keyFacts)
    .map((fact) => ({ kind: fact.kind, label: clip(fact.label, B.factLabel), value: fact.value }));

  const fraudSignals = analysis.fraudSignals.slice(0, B.fraudSignals).map((signal) => ({
    explanation: clip(signal.explanation, B.explanation),
    sourceQuote: clipOrNull(signal.sourceQuote, B.quote),
    page: toPage(signal.page),
  }));

  const language = analysis.documentLanguage.trim();
  const senderName = analysis.sender ? clip(analysis.sender.name, B.senderName) : '';

  return {
    documentType: analysis.documentType,
    title: clip(analysis.title, B.title),
    documentLanguage:
      LANGUAGE_TAG.test(language) && language.length <= B.languageTag ? language : 'und',
    sender: analysis.sender && senderName ? { name: senderName, kind: analysis.sender.kind } : null,
    documentDate,
    summary: clip(analysis.summary, B.summary),
    actions,
    deadlines,
    risks,
    keyFacts,
    fraudSignals,
    quality: {
      readable: analysis.quality.readable,
      issues: [...new Set(analysis.quality.issues)],
    },
  };
}

/** Trims `text` and cuts it to `max` characters, ending with "…" if it had to be cut. */
export function clip(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  let cut = trimmed.slice(0, max - 1);
  // Don't leave half of a character outside the Basic Multilingual Plane (an emoji, say).
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
}

function clipOrNull(text: string | null, max: number) {
  return text === null ? null : clip(text, max);
}

const RANK: Record<Level, number> = { high: 0, medium: 1, low: 2 };

/** At most `max` items: the most important ones, in their original order. */
function mostImportant<T>(items: T[], max: number, level: (item: T) => Level): T[] {
  if (items.length <= max) return items;
  const kept = new Set(
    items
      .map((item, index) => ({ rank: RANK[level(item)], index }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, max)
      .map(({ index }) => index)
  );
  return items.filter((_item, index) => kept.has(index));
}
