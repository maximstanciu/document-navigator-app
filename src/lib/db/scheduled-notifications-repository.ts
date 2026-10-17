import type { SqlDatabase } from './database';
import { placeholders } from './sql';
import type { ScheduledNotificationRecord } from './types';

type ScheduledNotificationRow = { notification_id: string; deadline_id: string; fire_at: string };

function toRecord(row: ScheduledNotificationRow): ScheduledNotificationRecord {
  return { notificationId: row.notification_id, deadlineId: row.deadline_id, fireAt: row.fire_at };
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
