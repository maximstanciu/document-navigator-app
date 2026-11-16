import type { SqlDatabase, SqlExecutor } from './database';
import { placeholders } from './sql';
import type { ScheduledNotificationRecord } from './types';

type ScheduledNotificationRow = { notification_id: string; deadline_id: string; fire_at: string };

function toRecord(row: ScheduledNotificationRow): ScheduledNotificationRecord {
  return { notificationId: row.notification_id, deadlineId: row.deadline_id, fireAt: row.fire_at };
}

/**
 * Drops the bookkeeping of the reminders of `deadlineIds` through `tx`, so other repositories can
 * do it inside their transaction, and returns the notification ids for the caller to cancel in the
 * OS.
 */
export async function takeScheduledNotifications(
  tx: SqlExecutor,
  deadlineIds: readonly string[]
): Promise<string[]> {
  if (deadlineIds.length === 0) return [];
  const inList = placeholders(deadlineIds.length);
  const rows = await tx.getAllAsync<{ notification_id: string }>(
    `SELECT notification_id FROM scheduled_notifications WHERE deadline_id IN (${inList})`,
    deadlineIds
  );
  await tx.runAsync(
    `DELETE FROM scheduled_notifications WHERE deadline_id IN (${inList})`,
    deadlineIds
  );
  return rows.map((row) => row.notification_id);
}

/** Bookkeeping of reminders scheduled in the OS, reconciled by `syncReminders()` (REM-7). */
export function createScheduledNotificationsRepository(db: SqlDatabase) {
  return {
    async list(): Promise<ScheduledNotificationRecord[]> {
      const rows = await db.getAllAsync<ScheduledNotificationRow>(
        'SELECT notification_id, deadline_id, fire_at FROM scheduled_notifications ORDER BY fire_at'
      );
      return rows.map(toRecord);
    },

    async insert(record: ScheduledNotificationRecord): Promise<void> {
      await db.runAsync(
        'INSERT INTO scheduled_notifications (notification_id, deadline_id, fire_at) VALUES (?, ?, ?)',
        [record.notificationId, record.deadlineId, record.fireAt]
      );
    },

    async removeByIds(notificationIds: readonly string[]): Promise<void> {
      if (notificationIds.length === 0) return;
      await db.runAsync(
        `DELETE FROM scheduled_notifications WHERE notification_id IN (${placeholders(notificationIds.length)})`,
        notificationIds
      );
    },
  };
}

export type ScheduledNotificationsRepository = ReturnType<
  typeof createScheduledNotificationsRepository
>;
