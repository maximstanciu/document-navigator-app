import { addDays, localCalendarDate } from '@/shared/calendar-date';

import type { DeadlineSummary, DocumentSummary } from './types';

/** How far ahead a deadline, and how long after the analysis a warning, needs attention (HOME-1). */
export const ATTENTION_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export type AttentionItem = {
  document: DocumentSummary;
  /** Its open deadlines that are overdue or due within `ATTENTION_DAYS`, soonest first. */
  deadlines: DeadlineSummary[];
  /**
   * In the block only for its fraud signs or high risk, with no deadline due soon: «Got it» takes
   * it out (HOME-1).
   */
  dismissible: boolean;
};

/** The open deadlines of each document, soonest first, given `deadlines` sorted that way. */
export function deadlinesByDocument(
  deadlines: readonly DeadlineSummary[]
): Map<string, DeadlineSummary[]> {
  const byDocument = new Map<string, DeadlineSummary[]>();
  for (const deadline of deadlines) {
    const list = byDocument.get(deadline.documentId);
    if (list) list.push(deadline);
    else byDocument.set(deadline.documentId, [deadline]);
  }
  return byDocument;
}

/**
 * Fraud signs or a high risk stay in the block for `ATTENTION_DAYS` after the analysis, until
 * «Got it». «Got it» counts for the analysis it was pressed after: a new analysis shows its own
 * warnings again.
 */
function hasFreshWarning(document: DocumentSummary, now: Date): boolean {
  if (!(document.hasFraudSignals || document.hasHighRisk) || !document.analyzedAt) return false;
  if (document.attentionDismissedAt && document.attentionDismissedAt >= document.analyzedAt) {
    return false;
  }
  return now.getTime() - Date.parse(document.analyzedAt) < ATTENTION_DAYS * DAY_MS;
}

// Plain comparison, not localeCompare: the order must not depend on the device's language.
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareDue(a: DeadlineSummary, b: DeadlineSummary) {
  return compare(a.dueDate, b.dueDate) || compare(a.dueTime ?? '24:00', b.dueTime ?? '24:00');
}

/**
 * «Needs attention» at `now` (HOME-1): documents with open deadlines that are overdue or due in the
 * next `ATTENTION_DAYS` days (the device's calendar days), and documents with fraud signs or a high
 * risk for `ATTENTION_DAYS` after their analysis or until «Got it». Documents with deadlines come
 * first, the most urgent at the top; then warnings only, fraud before risk, newest analysis first.
 *
 * `openDeadlines` are the open deadlines of all documents, soonest first.
 */
export function selectAttention(
  documents: readonly DocumentSummary[],
  openDeadlines: readonly DeadlineSummary[],
  now: Date
): AttentionItem[] {
  const horizon = addDays(localCalendarDate(now), ATTENTION_DAYS);
  const byDocument = deadlinesByDocument(openDeadlines);
  const withDeadlines: AttentionItem[] = [];
  const warningsOnly: AttentionItem[] = [];

  for (const document of documents) {
    const deadlines = (byDocument.get(document.id) ?? []).filter(
      (deadline) => deadline.dueDate <= horizon
    );
    if (deadlines.length > 0) {
      withDeadlines.push({ document, deadlines, dismissible: false });
    } else if (hasFreshWarning(document, now)) {
      warningsOnly.push({ document, deadlines, dismissible: true });
    }
  }

  withDeadlines.sort(
    (a, b) => compareDue(a.deadlines[0], b.deadlines[0]) || compare(a.document.id, b.document.id)
  );
  warningsOnly.sort(
    (a, b) =>
      Number(b.document.hasFraudSignals) - Number(a.document.hasFraudSignals) ||
      compare(b.document.analyzedAt ?? '', a.document.analyzedAt ?? '') ||
      compare(a.document.id, b.document.id)
  );
  return [...withDeadlines, ...warningsOnly];
}
