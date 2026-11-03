import type { Level, LlmAnalysisShape } from '@/shared/analysis/schema';
import { addDays, addMonths, endOfPeriod, isCalendarDate } from '@/shared/calendar-date';

import { quoteWritesDate } from './quoted-date';

type ShapeDeadline = LlmAnalysisShape['deadlines'][number];

export type DeadlineDateContext = {
  /** The document date after post-processing: a calendar date or `null`. */
  documentDate: string | null;
  /** YYYY-MM-DD on the device. */
  today: string;
};

/**
 * The date of a deadline, whether it is explicit or computed, and how sure it is (SPEC §7.4,
 * rule 3). An explicit deadline keeps the model's date. So does a computed one whose quote writes
 * that date out: the model often calls a date from the text computed and makes up a rule that
 * gives it. Such a deadline becomes explicit, unless its rule counts back from that very date
 * ("3 months before 31.01.2027"): then the date in the text isn't the deadline, and keeping it
 * would make the deadline later than the real one.
 *
 * Any other computed deadline is counted by its `rule` so that it is never later than the real
 * deadline:
 *
 * - "From the document date" and "from receipt" start at the document date, since a letter can't
 *   arrive before it was written. Without a document date the count starts today and the
 *   confidence is `low`: only then may the date come out later than the real one.
 * - Days and weeks are added (subtracted for `before`). Months and years lead to the same day of
 *   the month, or to the last day of a month that has no such day, as both BGB §§ 187–188 and the
 *   Russian Civil Code (art. 191–192) count. `endOf` moves an `after` date to the end of its month,
 *   quarter or year.
 * - Weekends and holidays don't move the date: the app reminds about the earlier one.
 * - A rule that lacks what the count needs keeps the model's date with `low` confidence: a deadline
 *   is better shown with a warning than lost.
 *
 * A computed date is never `high` confidence. The range check comes after this.
 */
export function deadlineDate(
  deadline: Pick<ShapeDeadline, 'date' | 'dateSource' | 'rule' | 'confidence' | 'sourceQuote'>,
  { documentDate, today }: DeadlineDateContext
): { date: string; dateSource: ShapeDeadline['dateSource']; confidence: Level } {
  const explicit = {
    date: deadline.date,
    dateSource: 'explicit',
    confidence: deadline.confidence,
  } as const;
  if (deadline.dateSource === 'explicit') return explicit;

  const { rule } = deadline;
  const start = countStart(rule, documentDate ?? today);
  const countsBack = rule?.direction === 'before' && deadline.date === start;
  if (!countsBack && quoteWritesDate(deadline.sourceQuote, deadline.date)) return explicit;
  if (rule === null || start === null) {
    return { date: deadline.date, dateSource: 'computed', confidence: 'low' };
  }

  const amount = rule.direction === 'after' ? rule.amount : -rule.amount;
  const counted =
    rule.unit === 'day'
      ? addDays(start, amount)
      : rule.unit === 'week'
        ? addDays(start, amount * 7)
        : addMonths(start, rule.unit === 'month' ? amount : amount * 12);
  const date =
    rule.direction === 'after' && rule.endOf !== null ? endOfPeriod(counted, rule.endOf) : counted;

  const fromToday = rule.from !== 'date_in_text' && documentDate === null;
  const confidence = fromToday
    ? 'low'
    : deadline.confidence === 'high'
      ? 'medium'
      : deadline.confidence;
  return { date, dateSource: 'computed', confidence };
}

/** Where the rule's count starts, or `null` when the rule lacks what the count needs. */
function countStart(rule: ShapeDeadline['rule'], documentDateOrToday: string): string | null {
  if (rule === null || !Number.isInteger(rule.amount) || rule.amount < 1) return null;
  if (rule.from !== 'date_in_text') return documentDateOrToday;
  return isCalendarDate(rule.fromDate) ? rule.fromDate : null;
}
