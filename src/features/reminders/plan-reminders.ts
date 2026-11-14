import type { TFunction } from 'i18next';

import type { DeadlineRecord, ScheduledNotificationRecord, Settings } from '@/lib/db/types';
import type { DeadlineKind } from '@/shared/analysis/schema';
import { isCalendarDate } from '@/shared/calendar-date';

/**
 * Which reminders should be scheduled, and how that differs from what is (REM-2, REM-3, REM-7,
 * REM-8, REM-9, REM-12, REM-13, REM-14). Pure: no OS, no database. `syncReminders()`
 * (`./sync-reminders.ts`) applies the result to the OS.
 */

/** iOS keeps at most 64 pending notifications: the nearest 60 go first, the rest on a later sync (REM-8). */
export const REMINDER_LIMIT = 60;

/**
 * Deadlines that take preparation — an objection to write, papers to gather, a cancellation that
 * has to arrive in time — get a reminder this many days ahead too (REM-14).
 */
export const PREPARATION_OFFSET_DAYS = 14;
const PREPARATION_KINDS: ReadonlySet<DeadlineKind> = new Set([
  'response',
  'submission',
  'cancellation',
]);

/** The one reminder the day after a deadline still open (REM-13), as days before it. */
export const OVERDUE_OFFSET_DAYS = -1;

/**
 * The notification category with the «Done» and «Remind tomorrow» buttons (REM-15). It is part of
 * every reminder's id (REM-7): another set of buttons gets another category name, and the next sync
 * replaces the reminders scheduled before. No `:` or `-` in it (expo-notifications).
 */
export const REMINDER_CATEGORY = 'deadline_reminder';

export type ReminderDeadline = Pick<
  DeadlineRecord,
  | 'id'
  | 'documentId'
  | 'kind'
  | 'description'
  | 'dueDate'
  | 'status'
  | 'reminderOffsetsDays'
  | 'snoozedUntil'
  | 'updatedAt'
  | 'deletedAt'
>;

export type ReminderSettings = Pick<
  Settings,
  'reminderOffsetsDays' | 'reminderTime' | 'notificationDetails' | 'overdueReminder'
> & {
  /** The interface language the text is shown in (SET-1). */
  language: string;
};

type When = 'overdue' | 'yesterday' | 'today' | 'tomorrow' | 'inDays';

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
  /**
   * Days before the due date; `OVERDUE_OFFSET_DAYS` for the reminder after it (REM-13), fewer still
   * for a reminder put off from a notification (REM-15).
   */
  daysBefore: number;
  text: ReminderText;
  /** The buttons the notification shows (REM-15). */
  category: typeof REMINDER_CATEGORY;
};

export type ReminderDiff = {
  /** Desired reminders that aren't scheduled yet, soonest first. */
  schedule: PlannedReminder[];
  /** Ids of scheduled reminders that are no longer desired. */
  cancel: string[];
};

/**
 * A deadline's own offsets win over the defaults; `[]` turns its reminders off, the one after the
 * deadline too (REM-3). On the defaults, a deadline that takes preparation gets 14 days ahead as well
 * (REM-14); with reminders on, a deadline still open gets one the day after (REM-13, SET-7).
 */
function offsetsOf(deadline: ReminderDeadline, settings: ReminderSettings): number[] {
  const own = deadline.reminderOffsetsDays;
  const offsets = (own ?? settings.reminderOffsetsDays).filter(
    (days) => Number.isInteger(days) && days >= 0
  );
  if (offsets.length === 0) return [];
  if (own === null && PREPARATION_KINDS.has(deadline.kind)) offsets.push(PREPARATION_OFFSET_DAYS);
  if (settings.overdueReminder) offsets.push(OVERDUE_OFFSET_DAYS);
  return [...new Set(offsets)];
}

/**
 * `time` (HH:mm) on the day `daysBefore` days before `date` (after it, when negative), in the
 * device's time zone. `Date` counts calendar days across months and DST changes, so the reminder
 * keeps its wall-clock time.
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
  const when: When =
    daysBefore < OVERDUE_OFFSET_DAYS
      ? 'overdue'
      : daysBefore < 0
        ? 'yesterday'
        : daysBefore === 0
          ? 'today'
          : daysBefore === 1
            ? 'tomorrow'
            : 'inDays';
  // Days away from the due date, whichever side.
  const count = Math.abs(daysBefore);
  return detailed
    ? {
        variant: 'detailed',
        key: `reminders.notification.detailed.${when}`,
        params: { count, description: deadline.description },
      }
    : {
        variant: 'neutral',
        key: `reminders.notification.neutral.${when}`,
        params: { count },
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
 * one on the deadline too, and the buttons on the category (REM-15).
 */
function reminderId(
  deadline: ReminderDeadline,
  fireAt: string,
  daysBefore: number,
  settings: ReminderSettings
) {
  const content = settings.notificationDetails ? `detailed@${deadline.updatedAt}` : 'neutral';
  return `${deadline.id}/${fireAt}/${daysBefore}d/${settings.language}/${content}/${REMINDER_CATEGORY}`;
}

/** Calendar days from the local day of `instant` to `date` (YYYY-MM-DD); negative once it passed. */
function daysUntil(date: string, instant: number): number {
  const [year, month, day] = date.split('-').map(Number);
  const at = new Date(instant);
  const from = Date.UTC(at.getFullYear(), at.getMonth(), at.getDate());
  return Math.round((Date.UTC(year, month - 1, day) - from) / 86_400_000);
}

/**
 * «Remind tomorrow» on a reminder's notification (REM-15): tomorrow at the reminder time (HH:mm), in
 * the device's time zone, as an ISO 8601 instant.
 */
export function remindTomorrowAt(now: Date, time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    hours,
    minutes
  ).toISOString();
}

// Plain comparison, not localeCompare: the order must not depend on the device's language.
function compare(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The reminders that should be scheduled at `now`: for each open deadline (REM-9: not `done`,
 * `dismissed` or deleted), its offsets in days before the due date at the reminder time in the
 * device's time zone (REM-2, REM-3, REM-14), the day after it (REM-13) and the one put off from a
 * notification (REM-15), skipping those not in the future and the put-off one when it falls on
 * another reminder. The nearest `REMINDER_LIMIT`, soonest first, ties by deadline id (REM-8).
 */
export function planReminders(
  deadlines: readonly ReminderDeadline[],
  settings: ReminderSettings,
  now: Date
): PlannedReminder[] {
  const planned: PlannedReminder[] = [];
  const ids = new Set<string>();
  for (const deadline of deadlines) {
    if (deadline.status !== 'open' || deadline.deletedAt !== null) continue;
    if (!isCalendarDate(deadline.dueDate)) continue;
    const add = (fireTime: number, daysBefore: number) => {
      // Negated so that an invalid time (NaN) is skipped too.
      if (!(fireTime > now.getTime())) return;
      const fireAt = new Date(fireTime).toISOString();
      const id = reminderId(deadline, fireAt, daysBefore, settings);
      if (ids.has(id)) return;
      ids.add(id);
      planned.push({
        id,
        deadlineId: deadline.id,
        documentId: deadline.documentId,
        fireAt,
        daysBefore,
        text: reminderText(deadline, daysBefore, settings.notificationDetails),
        category: REMINDER_CATEGORY,
      });
    };
    const offsets = offsetsOf(deadline, settings);
    for (const daysBefore of offsets) {
      add(localFireTime(deadline.dueDate, daysBefore, settings.reminderTime), daysBefore);
    }
    // Put off from a notification, it comes once more, unless the reminders are off (REM-15).
    if (offsets.length > 0 && deadline.snoozedUntil !== null) {
      const fireTime = Date.parse(deadline.snoozedUntil);
      add(fireTime, daysUntil(deadline.dueDate, fireTime));
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
