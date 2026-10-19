// Test-only: the notifications adapter (`@/features/reminders/notifications`) over an in-memory OS.
// Every test gets it (src/test/setup-native-modules.ts) with notifications unavailable, as on web;
// a test that needs them sets `fakeNotifications.permission`.
import type {
  NotificationPermission,
  ReminderNotification,
} from '@/features/reminders/notifications';

export type { NotificationPermission, ReminderNotification };

export const DEADLINES_CHANNEL_ID = 'deadlines';

export const fakeNotifications = {
  /** What `getNotificationPermission()` reports. */
  permission: 'unavailable' as NotificationPermission,
  /** What the person answers in the system dialog; it becomes `permission`. */
  answer: 'granted' as NotificationPermission,
  /** Pending notifications by identifier, as the OS holds them. */
  scheduled: new Map<string, ReminderNotification>(),

  /** The pending notifications, soonest first. */
  pending(): ReminderNotification[] {
    return [...this.scheduled.values()].sort((a, b) => (a.fireAt < b.fireAt ? -1 : 1));
  },
};

export const setUpNotifications = jest.fn(
  async (_channel: { name: string; description: string }) => {}
);

export const getNotificationPermission = jest.fn(async () => fakeNotifications.permission);

export const requestNotificationPermission = jest.fn(async () => {
  if (fakeNotifications.permission === 'undetermined') {
    fakeNotifications.permission = fakeNotifications.answer;
  }
  return fakeNotifications.permission;
});

export const listScheduledNotificationIds = jest.fn(async () => [
  ...fakeNotifications.scheduled.keys(),
]);

export const scheduleNotification = jest.fn(async (notification: ReminderNotification) => {
  fakeNotifications.scheduled.set(notification.id, notification);
});

export const cancelNotification = jest.fn(async (id: string) => {
  fakeNotifications.scheduled.delete(id);
});

export const openNotificationSettings = jest.fn(async () => {});

/** A fresh OS without notifications and clean call records; runs before every test. */
export function resetFakeNotifications() {
  fakeNotifications.permission = 'unavailable';
  fakeNotifications.answer = 'granted';
  fakeNotifications.scheduled.clear();
  for (const fn of [
    setUpNotifications,
    getNotificationPermission,
    requestNotificationPermission,
    listScheduledNotificationIds,
    scheduleNotification,
    cancelNotification,
    openNotificationSettings,
  ]) {
    fn.mockClear();
  }
}
