import type {
  NotificationChannel,
  NotificationPermission,
  OpenedNotification,
  ReminderNotification,
} from './notifications';

export type {
  NotificationChannel,
  NotificationPermission,
  OpenedNotification,
  ReminderNotification,
} from './notifications';

// Web is a development preview without notifications: reminders are neither offered nor scheduled,
// and the result of an analysis comes by polling, without a push (ANL-12).

export const DEADLINES_CHANNEL_ID = 'deadlines';
export const ANALYSIS_CHANNEL_ID = 'analysis';

export async function setUpNotifications(_channels: {
  deadlines: NotificationChannel;
  analysis: NotificationChannel;
}) {}

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

export async function dismissShownNotifications(): Promise<void> {}

export function getLastOpenedNotification(): OpenedNotification | null {
  return null;
}

export function clearLastOpenedNotification(): void {}

export function addNotificationOpenedListener(_listener: (opened: OpenedNotification) => void) {
  return () => {};
}

export function addAnalysisPushListener(_listener: (jobId: string) => void) {
  return () => {};
}

/** Never called: nothing asks for a token without permission. */
export async function getPushToken(): Promise<string> {
  throw new Error('No push notifications on web');
}

export function addPushTokenChangeListener(_listener: (token: string) => void) {
  return () => {};
}

export async function openNotificationSettings(): Promise<void> {}
