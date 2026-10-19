import type { TFunction } from 'i18next';

import type { DeadlineRecord, ScheduledNotificationRecord, Settings } from '@/lib/db/types';
import { isCalendarDate } from '@/shared/calendar-date';

/**
 * Which reminders should be scheduled, and how that differs from what is (REM-2, REM-3, REM-7,
 * REM-8, REM-9, REM-12). Pure: no OS, no database. `syncReminders()` (`./sync-reminders.ts`)
 * applies the result to the OS.
 */

/** iOS keeps at most 64 pending notifications: the nearest 60 go first, the rest on a later sync (REM-8). */
export const REMINDER_LIMIT = 60;

export type ReminderDeadline = Pick<
  DeadlineRecord,
  | 'id'
  | 'documentId'
  | 'description'
  | 'dueDate'
  | 'status'
  | 'reminderOffsetsDays'
  | 'updatedAt'
  | 'deletedAt'
>;

export type ReminderSettings = Pick<
  Settings,
  'reminderOffsetsDays' | 'reminderTime' | 'notificationDetails'
> & {
  /** The interface language the text is shown in (SET-1). */
  language: string;
};

type When = 'today' | 'tomorrow' | 'inDays';

/**
 * An i18n key and its values. Only the detailed text carries the deadline's description; the
 * neutral one is safe on the lock screen (REM-12, SET-5).
 */
export type ReminderText =
  | {
      variant: 'neutral';
      key: `reminders.notification.neutral.${When}`;
      params: { count: number };
    }
  | {
      variant: 'detailed';
      key: `reminders.notification.detailed.${When}`;
      params: { count: number; description: string };
    };

export type PlannedReminder = {
  /** Stable for the same reminder: its identifier in the OS and in `scheduled_notifications`. */
  id: string;
  deadlineId: string;
  /** The notification opens this document (REM-6). */
  documentId: string;
  /** When to fire, as an ISO 8601 instant. */
  fireAt: string;
  daysBefore: number;
  text: ReminderText;
};

export type ReminderDiff = {
  /** Desired reminders that aren't scheduled yet, soonest first. */
  schedule: PlannedReminder[];
  /** Ids of scheduled reminders that are no longer desired. */
  cancel: string[];
};

/** A deadline's own offsets win over the defaults; `[]` turns its reminders off (REM-3). */
function offsetsOf(deadline: ReminderDeadline, settings: ReminderSettings): number[] {
  const offsets = deadline.reminderOffsetsDays ?? settings.reminderOffsetsDays;
  return [...new Set(offsets.filter((days) => Number.isInteger(days) && days >= 0))];
}

/**
 * `time` (HH:mm) on the day `daysBefore` days before `date`, in the device's time zone. `Date`
 * counts calendar days across months and DST changes, so the reminder keeps its wall-clock time.
 */
function localFireTime(date: string, daysBefore: number, time: string): number {
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(year, month - 1, day - daysBefore, hours, minutes).getTime();
}

function reminderText(
  deadline: ReminderDeadline,
  daysBefore: number,
  detailed: boolean
): ReminderText {
  const when: When = daysBefore === 0 ? 'today' : daysBefore === 1 ? 'tomorrow' : 'inDays';
  return detailed
    ? {
        variant: 'detailed',
        key: `reminders.notification.detailed.${when}`,
        params: { count: daysBefore, description: deadline.description },
      }
    : {
        variant: 'neutral',
        key: `reminders.notification.neutral.${when}`,
        params: { count: daysBefore },
      };
}

/** The notification's text in the language of `t`. */
export function reminderMessage(text: ReminderText, t: TFunction): string {
  // Narrowed per variant: typed `t()` checks each key's values.
  return text.variant === 'detailed' ? t(text.key, text.params) : t(text.key, text.params);
}

/**
 * Everything the notification shows is in its id, so a changed text gets a new id and replaces the
 * old notification: the neutral text depends only on the days left and the language, the detailed
 * one on the deadline too.
 */
function reminderId(
  deadline: ReminderDeadline,
  fireAt: string,
  daysBefore: number,
  settings: ReminderSettings
) {
  const content = settings.notificationDetails ? `detailed@${deadline.updatedAt}` : 'neutral';
  return `${deadline.id}/${fireAt}/${daysBefore}d/${settings.language}/${content}`;
}

// Plain comparison, not localeCompare: the order must not depend on the device's language.
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The reminders that should be scheduled at `now`: for each open deadline (REM-9: not `done`,
 * `dismissed` or deleted), its offsets in days before the due date at the reminder time in the
 * device's time zone (REM-2, REM-3), skipping those not in the future. The nearest
 * `REMINDER_LIMIT`, soonest first, ties by deadline id (REM-8).
 */
export function planReminders(
  deadlines: readonly ReminderDeadline[],
  settings: ReminderSettings,
  now: Date
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  for (const deadline of deadlines) {
    if (deadline.status !== 'open' || deadline.deletedAt !== null) continue;
    if (!isCalendarDate(deadline.dueDate)) continue;
    for (const daysBefore of offsetsOf(deadline, settings)) {
      const fireTime = localFireTime(deadline.dueDate, daysBefore, settings.reminderTime);
      // Negated so that an invalid time (NaN) is skipped too.
      if (!(fireTime > now.getTime())) continue;
      const fireAt = new Date(fireTime).toISOString();
      planned.push({
        id: reminderId(deadline, fireAt, daysBefore, settings),
        deadlineId: deadline.id,
        documentId: deadline.documentId,
        fireAt,
        daysBefore,
        text: reminderText(deadline, daysBefore, settings.notificationDetails),
      });
    }
  }
  planned.sort(
    (a, b) =>
      compare(a.fireAt, b.fireAt) || compare(a.deadlineId, b.deadlineId) || compare(a.id, b.id)
  );
  return planned.slice(0, REMINDER_LIMIT);
}

/**
 * What to change so that exactly `desired` is scheduled (REM-7). Reminders are matched by id, so
 * a reminder that already fired or belongs to a closed, dismissed or deleted deadline is cancelled,
 * and a second run after applying the result changes nothing.
 */
export function diffReminders(
  desired: readonly PlannedReminder[],
  scheduled: readonly Pick<ScheduledNotificationRecord, 'notificationId'>[]
): ReminderDiff {
  const scheduledIds = new Set(scheduled.map((record) => record.notificationId));
  const desiredIds = new Set(desired.map((reminder) => reminder.id));
  return {
    schedule: desired.filter((reminder) => !scheduledIds.has(reminder.id)),
    cancel: [...scheduledIds].filter((id) => !desiredIds.has(id)),
  };
}

/** The `scheduled_notifications` row for a reminder once it is scheduled in the OS. */
export function toScheduledRecord(reminder: PlannedReminder): ScheduledNotificationRecord {
  return { notificationId: reminder.id, deadlineId: reminder.deadlineId, fireAt: reminder.fireAt };
}
