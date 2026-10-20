import type { TFunction } from 'i18next';

import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';

import type { CalendarEventDraft } from './calendar';

/**
 * The event «Add to calendar» fills in (REM-10): the deadline as its title, and in the notes what
 * is left to do by then, the document, and how far to trust the date, as the deadline's card says.
 * The person sees all of it in the form before saving.
 */
export function calendarEventFor(
  deadline: DeadlineRecord,
  actions: readonly ActionRecord[],
  documentTitle: string,
  t: TFunction
): CalendarEventDraft {
  const title = deadline.description.trim();
  const computed = deadline.dateSource === 'computed';
  const lines = [
    // An action that only repeats the deadline adds nothing to the title.
    ...actions
      .filter((action) => !action.done && action.description.trim() !== title)
      .map((action) => `• ${action.description.trim()}`),
    t('deadlines.document', { title: documentTitle }),
  ];
  if (computed && deadline.computation) {
    lines.push(t('documents.deadline.computed', { computation: deadline.computation }));
  }
  if (deadline.dateSource !== 'user' && (computed || deadline.confidence !== 'high')) {
    lines.push(t('documents.deadline.checkOriginal'));
  }
  return { title, date: deadline.dueDate, time: deadline.dueTime, notes: lines.join('\n') };
}
