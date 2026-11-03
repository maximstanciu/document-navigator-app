// Test-only: the notifications adapter (`@/features/reminders/notifications`) over an in-memory OS.
// Every test gets it (src/test/setup-native-modules.ts) with notifications unavailable, as on web;
// a test that needs them sets `fakeNotifications.permission`.
import type {
  NotificationChannel,
  NotificationPermission,
  OpenedNotification,
  ReminderNotification,
} from '@/features/reminders/notifications';

export type {
  NotificationChannel,
  NotificationPermission,
  OpenedNotification,
  ReminderNotification,
};

const openedListeners = new Set<(opened: OpenedNotification) => void>();
const analysisPushListeners = new Set<(jobId: string) => void>();
const tokenListeners = new Set<(token: string) => void>();

export const DEADLINES_CHANNEL_ID = 'deadlines';
export const ANALYSIS_CHANNEL_ID = 'analysis';

export const fakeNotifications = {
  /** What `getNotificationPermission()` reports. */
  permission: 'unavailable' as NotificationPermission,
  /** What the person answers in the system dialog; it becomes `permission`. */
  answer: 'granted' as NotificationPermission,
  /** Pending notifications by identifier, as the OS holds them. */
  scheduled: new Map<string, ReminderNotification>(),

  /** The last tap on a notification, kept until cleared: set it before rendering for a cold start. */
  lastOpened: null as OpenedNotification | null,

  /**
   * What `getPushToken()` gives: the Expo push token, or `null` when the OS gives none (no FCM in
   * the build, no Google Play services, no network).
   */
  pushToken: 'ExponentPushToken[fake-device]' as string | null,

  /** The pending notifications, soonest first. */
  pending(): ReminderNotification[] {
    return [...this.scheduled.values()].sort((a, b) => (a.fireAt < b.fireAt ? -1 : 1));
  },

  /** The person taps a notification while the app runs: the OS keeps it and tells the listeners. */
  tap(opened: OpenedNotification) {
    this.lastOpened = opened;
    for (const listener of openedListeners) listener(opened);
  },

  /** A push about a finished analysis comes while the app is open (ANL-12). */
  receiveAnalysisPush(jobId: string) {
    for (const listener of analysisPushListeners) listener(jobId);
  },

  /** The push service gives the device a new token while the app runs. */
  changePushToken(token: string) {
    this.pushToken = token;
    for (const listener of tokenListeners) listener(token);
  },
};

export const setUpNotifications = jest.fn(
  async (_channels: { deadlines: NotificationChannel; analysis: NotificationChannel }) => {}
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

export const getLastOpenedNotification = jest.fn(() => fakeNotifications.lastOpened);

export const clearLastOpenedNotification = jest.fn(() => {
  fakeNotifications.lastOpened = null;
});

export const addNotificationOpenedListener = jest.fn(
  (listener: (opened: OpenedNotification) => void) => {
    openedListeners.add(listener);
    return () => {
      openedListeners.delete(listener);
    };
  }
);

export const addAnalysisPushListener = jest.fn((listener: (jobId: string) => void) => {
  analysisPushListeners.add(listener);
  return () => {
    analysisPushListeners.delete(listener);
  };
});

export const getPushToken = jest.fn(async () => {
  if (fakeNotifications.pushToken === null) throw new Error('No push token');
  return fakeNotifications.pushToken;
});

export const addPushTokenChangeListener = jest.fn((listener: (token: string) => void) => {
  tokenListeners.add(listener);
  return () => {
    tokenListeners.delete(listener);
  };
});

export const openNotificationSettings = jest.fn(async () => {});

/** A fresh OS without notifications and clean call records; runs before every test. */
export function resetFakeNotifications() {
  fakeNotifications.permission = 'unavailable';
  fakeNotifications.answer = 'granted';
  fakeNotifications.scheduled.clear();
  fakeNotifications.lastOpened = null;
  fakeNotifications.pushToken = 'ExponentPushToken[fake-device]';
  openedListeners.clear();
  analysisPushListeners.clear();
  tokenListeners.clear();
  for (const fn of [
    setUpNotifications,
    getNotificationPermission,
    requestNotificationPermission,
    listScheduledNotificationIds,
    scheduleNotification,
    cancelNotification,
    dismissShownNotifications,
    getLastOpenedNotification,
    clearLastOpenedNotification,
    addNotificationOpenedListener,
    addAnalysisPushListener,
    getPushToken,
    addPushTokenChangeListener,
    openNotificationSettings,
  ]) {
    fn.mockClear();
  }
}
