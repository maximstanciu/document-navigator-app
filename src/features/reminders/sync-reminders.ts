import { getRepositories } from '@/lib/db/repositories';
import { currentLanguage, i18n } from '@/lib/i18n/i18n';

import {
  cancelNotification,
  getNotificationPermission,
  listScheduledNotificationIds,
  scheduleNotification,
} from './notifications';
import { diffReminders, planReminders, reminderMessage, toScheduledRecord } from './plan-reminders';

export type SyncResult = { scheduled: number; cancelled: number };

async function sync(now: Date): Promise<SyncResult> {
  const { deadlines, settings, scheduledNotifications } = getRepositories();
  const language = currentLanguage();
  // Without the permission nothing would show: everything goes, and comes back once it is granted.
  const desired =
    (await getNotificationPermission()) === 'granted'
      ? planReminders(
          await deadlines.list({ statuses: ['open'] }),
          { ...(await settings.get()), language },
          now
        )
      : [];

  // The OS knows what is still pending. The table can miss a reminder scheduled right before a
  // crash, or keep one the OS lost (data restored on another phone).
  const [pendingIds, records] = await Promise.all([
    listScheduledNotificationIds(),
    scheduledNotifications.list(),
  ]);
  const { schedule, cancel } = diffReminders(
    desired,
    pendingIds.map((notificationId) => ({ notificationId }))
  );

  // Cancel first, so that the OS never holds more than the limit (REM-8).
  for (const id of cancel) await cancelNotification(id);
  const t = i18n.getFixedT(language);
  for (const reminder of schedule) {
    await scheduleNotification({
      id: reminder.id,
      fireAt: reminder.fireAt,
      body: reminderMessage(reminder.text, t),
      data: { documentId: reminder.documentId, deadlineId: reminder.deadlineId },
    });
  }

  // The table follows: rows of reminders that fired or are no longer wanted go, new ones come in.
  const desiredIds = new Set(desired.map((reminder) => reminder.id));
  const recordedIds = new Set(records.map((record) => record.notificationId));
  await scheduledNotifications.removeByIds([...recordedIds].filter((id) => !desiredIds.has(id)));
  for (const reminder of desired) {
    if (!recordedIds.has(reminder.id)) {
      await scheduledNotifications.insert(toScheduledRecord(reminder));
    }
  }
  return { scheduled: schedule.length, cancelled: cancel.length };
}

let queue: Promise<unknown> = Promise.resolve();

/**
 * Makes the reminders scheduled in the OS match the open deadlines and settings (REM-7): the nearest
 * 60 (REM-8), at `now` or the moment the sync starts. Idempotent: a second run changes nothing. Runs
 * one at a time, so overlapping calls never schedule or record the same reminder twice.
 */
export function syncReminders(now?: Date): Promise<SyncResult> {
  const run = queue.then(() => sync(now ?? new Date()));
  queue = run.catch(() => undefined);
  return run;
}

/**
 * `syncReminders()` without waiting, after a change to deadlines or settings and on app events. A
 * failure is left to the next sync, at the latest when the app returns to the foreground.
 */
export function syncRemindersInBackground(): void {
  syncReminders().catch((error: unknown) => {
    // Development builds only: an error may carry notification text (AGENTS.md → Privacy).
    if (__DEV__) console.warn('Reminder sync failed', error);
  });
}
