import {
  addNotificationResponseReceivedListener,
  AndroidImportance,
  cancelScheduledNotificationAsync,
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  getAllScheduledNotificationsAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  IosAuthorizationStatus,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  type NotificationPermissionsStatus,
  type NotificationResponse,
} from 'expo-notifications';
import { Linking } from 'react-native';

// Adapter over `expo-notifications`, local notifications only (REM-4): the rest of the app sees
// these functions, and tests mock this module. The web stub is notifications.web.ts.

/**
 * `unavailable`: no notifications on this platform (web). `denied` covers «don't ask again» too:
 * asking then returns at once without a dialog.
 */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'unavailable';

/** The Android channel of deadline reminders (REM-4); the person can tune it in system settings. */
export const DEADLINES_CHANNEL_ID = 'deadlines';

export type ReminderNotification = {
  /** Our reminder id, the notification's identifier in the OS. */
  id: string;
  /** ISO 8601 instant. */
  fireAt: string;
  /** Already in the interface language, neutral unless the person chose details (REM-12). */
  body: string;
  /** Ids only, for opening the document from the notification (REM-6, task 5.3). */
  data: { documentId: string; deadlineId: string };
};

/** A tap on a reminder: what its notification carries (REM-6, REM-12). */
export type OpenedReminder = {
  /** The notification's identifier, our reminder id. */
  notificationId: string;
  documentId: string;
  deadlineId: string;
};

function toPermission(response: NotificationPermissionsStatus): NotificationPermission {
  const iosStatus = response.ios?.status;
  if (
    response.granted ||
    iosStatus === IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === IosAuthorizationStatus.EPHEMERAL
  ) {
    return 'granted';
  }
  return response.status === 'undetermined' ? 'undetermined' : 'denied';
}

/**
 * Shows reminders while the app is open too, and creates or renames the `deadlines` channel. Run at
 * every start and after a language change: a channel's name and description can change, nothing
 * else can. Creating a channel asks for nothing (the app targets Android 13+), so the permission
 * dialog never appears at launch (REM-5).
 */
export async function setUpNotifications(channel: { name: string; description: string }) {
  setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  if (process.env.EXPO_OS === 'android') {
    await setNotificationChannelAsync(DEADLINES_CHANNEL_ID, {
      ...channel,
      importance: AndroidImportance.HIGH,
    });
  }
}

export async function getNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(await getPermissionsAsync());
}

/** Shows the system dialog when it still can (REM-5); call only from the person's own action. */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  return toPermission(
    await requestPermissionsAsync({
      ios: { allowAlert: true, allowSound: true, allowBadge: false },
    })
  );
}

/** The identifiers of everything scheduled and not fired yet: all of them are reminders. */
export async function listScheduledNotificationIds(): Promise<string[]> {
  const requests = await getAllScheduledNotificationsAsync();
  return requests.map((request) => request.identifier);
}

/**
 * A `DATE` trigger with the default `bestEffort` delivery: Android may deliver a few minutes late,
 * and the app needs no exact-alarm permission (REM-11). The same identifier replaces a notification.
 */
export async function scheduleNotification(notification: ReminderNotification): Promise<void> {
  await scheduleNotificationAsync({
    identifier: notification.id,
    content: { body: notification.body, data: notification.data },
    trigger: {
      type: SchedulableTriggerInputTypes.DATE,
      date: new Date(notification.fireAt),
      channelId: DEADLINES_CHANNEL_ID,
    },
  });
}

export async function cancelNotification(id: string): Promise<void> {
  await cancelScheduledNotificationAsync(id);
}

/**
 * The reminder behind a tap on its notification. Anything else is `null`: another action than the
 * tap itself (a dismiss action on iOS), or a notification without our ids.
 */
export function toOpenedReminder(response: NotificationResponse): OpenedReminder | null {
  if (response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) return null;
  const { identifier, content } = response.notification.request;
  const documentId = content.data?.documentId;
  const deadlineId = content.data?.deadlineId;
  if (typeof documentId !== 'string' || typeof deadlineId !== 'string') return null;
  return { notificationId: identifier, documentId, deadlineId };
}

/**
 * The last tap on a reminder, kept by the OS until cleared: the one that launched the app at a cold
 * start too, when no listener was there yet (REM-6).
 */
export function getLastOpenedReminder(): OpenedReminder | null {
  const response = getLastNotificationResponse();
  return response ? toOpenedReminder(response) : null;
}

/** Forgets the last tap, so that a later start or remount does not open its document again. */
export function clearLastOpenedReminder(): void {
  clearLastNotificationResponse();
}

/** Calls `listener` on every tap on a reminder while the app runs; returns the unsubscribe. */
export function addReminderOpenedListener(listener: (reminder: OpenedReminder) => void) {
  const subscription = addNotificationResponseReceivedListener((response) => {
    const reminder = toOpenedReminder(response);
    if (reminder) listener(reminder);
  });
  return () => subscription.remove();
}

/** The app's page in system settings, where notifications are turned back on (REM-5). */
export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}
