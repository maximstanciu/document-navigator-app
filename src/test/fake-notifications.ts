// Test-only: the notifications adapter (`@/features/reminders/notifications`) over an in-memory OS.
// Every test gets it (src/test/setup-native-modules.ts) with notifications unavailable, as on web;
// a test that needs them sets `fakeNotifications.permission`.
import type {
  NotificationPermission,
  OpenedReminder,
  ReminderNotification,
} from '@/features/reminders/notifications';

export type { NotificationPermission, OpenedReminder, ReminderNotification };

const openedListeners = new Set<(reminder: OpenedReminder) => void>();

export const DEADLINES_CHANNEL_ID = 'deadlines';

export const fakeNotifications = {
  /** What `getNotificationPermission()` reports. */
  permission: 'unavailable' as NotificationPermission,
  /** What the person answers in the system dialog; it becomes `permission`. */
  answer: 'granted' as NotificationPermission,
  /** Pending notifications by identifier, as the OS holds them. */
  scheduled: new Map<string, ReminderNotification>(),

  /** The last tap on a reminder, kept until cleared: set it before rendering for a cold start. */
  lastOpened: null as OpenedReminder | null,

  /** The pending notifications, soonest first. */
  pending(): ReminderNotification[] {
    return [...this.scheduled.values()].sort((a, b) => (a.fireAt < b.fireAt ? -1 : 1));
  },

  /** The person taps a reminder while the app runs: the OS keeps it and tells the listeners. */
  tap(reminder: OpenedReminder) {
    this.lastOpened = reminder;
    for (const listener of openedListeners) listener(reminder);
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

export const dismissShownNotifications = jest.fn(async () => {});

export const getLastOpenedReminder = jest.fn(() => fakeNotifications.lastOpened);

export const clearLastOpenedReminder = jest.fn(() => {
  fakeNotifications.lastOpened = null;
});

export const addReminderOpenedListener = jest.fn((listener: (reminder: OpenedReminder) => void) => {
  openedListeners.add(listener);
  return () => {
    openedListeners.delete(listener);
  };
});

export const openNotificationSettings = jest.fn(async () => {});

/** A fresh OS without notifications and clean call records; runs before every test. */
export function resetFakeNotifications() {
  fakeNotifications.permission = 'unavailable';
  fakeNotifications.answer = 'granted';
  fakeNotifications.scheduled.clear();
  fakeNotifications.lastOpened = null;
  openedListeners.clear();
  for (const fn of [
    setUpNotifications,
    getNotificationPermission,
    requestNotificationPermission,
    listScheduledNotificationIds,
    scheduleNotification,
    cancelNotification,
    dismissShownNotifications,
    getLastOpenedReminder,
    clearLastOpenedReminder,
    addReminderOpenedListener,
    openNotificationSettings,
  ]) {
    fn.mockClear();
  }
}
