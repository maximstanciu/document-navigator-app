import type { TFunction } from 'i18next';

import { daysBetween } from '@/shared/calendar-date';

/**
 * How soon an open deadline is due from `today` (HOME-1, REM-1): overdue, today, tomorrow or in N
 * days, by the device's calendar.
 */
export function formatDueIn(dueDate: string, today: string, t: TFunction) {
  const days = daysBetween(today, dueDate);
  if (days < 0) return t('deadlines.dueIn.overdue');
  if (days === 0) return t('deadlines.dueIn.today');
  if (days === 1) return t('deadlines.dueIn.tomorrow');
  return t('deadlines.dueIn.inDays', { count: days });
}
