import type { Level, LlmAnalysisShape } from '@/shared/analysis/schema';
import { addDays, addMonths, endOfPeriod, isCalendarDate } from '@/shared/calendar-date';

type ShapeDeadline = LlmAnalysisShape['deadlines'][number];

export type DeadlineDateContext = {
  /** The document date after post-processing: a calendar date or `null`. */
  documentDate: string | null;
  /** YYYY-MM-DD on the device. */
  today: string;
};

/**
 * The date of a deadline and how sure it is (SPEC §7.4, rule 3). An explicit deadline keeps the
 * model's date. A computed one is counted by its `rule` so that it is never later than the real
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
  deadline: Pick<ShapeDeadline, 'date' | 'dateSource' | 'rule' | 'confidence'>,
  { documentDate, today }: DeadlineDateContext
): { date: string; confidence: Level } {
  if (deadline.dateSource === 'explicit') {
    return { date: deadline.date, confidence: deadline.confidence };
  }
  const { rule } = deadline;
  if (rule === null || !Number.isInteger(rule.amount) || rule.amount < 1) {
    return { date: deadline.date, confidence: 'low' };
  }

  let start: string;
  if (rule.from === 'date_in_text') {
    if (!isCalendarDate(rule.fromDate)) return { date: deadline.date, confidence: 'low' };
    start = rule.fromDate;
  } else {
    start = documentDate ?? today;
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
  return { date, confidence };
}
