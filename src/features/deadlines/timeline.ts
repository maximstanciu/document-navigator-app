import { daysBetween } from '@/shared/calendar-date';

/** «This week» is today and the 6 days after it, so tomorrow is never «Later» (REM-1). */
export const THIS_WEEK_DAYS = 7;

export type TimelineGroupKey = 'overdue' | 'thisWeek' | 'later';

export type TimelineGroup<T> = { key: TimelineGroupKey; deadlines: T[] };

const GROUP_ORDER: readonly TimelineGroupKey[] = ['overdue', 'thisWeek', 'later'];

function groupOf(dueDate: string, today: string): TimelineGroupKey {
  const days = daysBetween(today, dueDate);
  if (days < 0) return 'overdue';
  return days < THIS_WEEK_DAYS ? 'thisWeek' : 'later';
}

/**
 * The Deadlines tab (REM-1): open deadlines in «Overdue», «This week» and «Later», by the device's
 * calendar date `today`. `deadlines` come soonest first and keep that order in each group; groups
 * without deadlines are left out.
 */
export function groupTimeline<T extends { dueDate: string }>(
  deadlines: readonly T[],
  today: string
): TimelineGroup<T>[] {
  const byKey: Record<TimelineGroupKey, T[]> = { overdue: [], thisWeek: [], later: [] };
  for (const deadline of deadlines) byKey[groupOf(deadline.dueDate, today)].push(deadline);
  const groups = GROUP_ORDER.map((key) => ({ key, deadlines: byKey[key] }));
  return groups.filter((group) => group.deadlines.length > 0);
}
