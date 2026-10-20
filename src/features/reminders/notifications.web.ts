import type { NotificationPermission, OpenedReminder, ReminderNotification } from './notifications';

export type { NotificationPermission, OpenedReminder, ReminderNotification } from './notifications';

// Web is a development preview without notifications: reminders are neither offered nor scheduled.

export const DEADLINES_CHANNEL_ID = 'deadlines';

export async function setUpNotifications(_channel: { name: string; description: string }) {}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return 'unavailable';
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return 'unavailable';
}

export async function listScheduledNotificationIds(): Promise<string[]> {
  return [];
}

/** Never called: nothing is scheduled without permission. */
export async function scheduleNotification(_notification: ReminderNotification): Promise<void> {}

export async function cancelNotification(_id: string): Promise<void> {}

export function getLastOpenedReminder(): OpenedReminder | null {
  return null;
}

export function clearLastOpenedReminder(): void {}

export function addReminderOpenedListener(_listener: (reminder: OpenedReminder) => void) {
  return () => {};
}

export async function openNotificationSettings(): Promise<void> {}
