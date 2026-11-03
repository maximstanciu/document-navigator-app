import Constants from 'expo-constants';
import {
  addNotificationReceivedListener,
  addNotificationResponseReceivedListener,
  addPushTokenListener,
  AndroidImportance,
  cancelScheduledNotificationAsync,
  clearLastNotificationResponse,
  DEFAULT_ACTION_IDENTIFIER,
  dismissAllNotificationsAsync,
  getAllScheduledNotificationsAsync,
  getExpoPushTokenAsync,
  getLastNotificationResponse,
  getPermissionsAsync,
  IosAuthorizationStatus,
  requestPermissionsAsync,
  SchedulableTriggerInputTypes,
  scheduleNotificationAsync,
  setNotificationChannelAsync,
  setNotificationHandler,
  type NotificationContent,
  type NotificationPermissionsStatus,
  type NotificationResponse,
} from 'expo-notifications';
import { Linking } from 'react-native';

// Adapter over `expo-notifications`: local reminders (REM-4) and the push about a finished analysis
// (ANL-12). The rest of the app sees these functions, and tests mock this module. The web stub is
// notifications.web.ts.

/**
 * `unavailable`: no notifications on this platform (web). `denied` covers «don't ask again» too:
 * asking then returns at once without a dialog.
 */
export type NotificationPermission = 'granted' | 'undetermined' | 'denied' | 'unavailable';

/** The Android channel of deadline reminders (REM-4); the person can tune it in system settings. */
export const DEADLINES_CHANNEL_ID = 'deadlines';

/** The Android channel of the push about a finished analysis (ANL-12), the one the server names. */
export const ANALYSIS_CHANNEL_ID = 'analysis';

/** A channel's texts, in the interface language. */
export type NotificationChannel = { name: string; description: string };

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

/**
 * A tap on one of our notifications: what it carries. A reminder names its document (REM-6,
 * REM-12); the push about a finished analysis, only the job (ANL-12).
 */
export type OpenedNotification =
  | {
      type: 'reminder';
      /** The notification's identifier, our reminder id. */
      notificationId: string;
      documentId: string;
      deadlineId: string;
    }
  | { type: 'analysis'; notificationId: string; jobId: string };

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

/** The job of a push about a finished analysis: the server sends `{ type: 'analysis', jobId }`. */
function analysisJobOf(content: NotificationContent): string | null {
  const { type, jobId } = content.data ?? {};
  return type === 'analysis' && typeof jobId === 'string' ? jobId : null;
}

/**
 * Shows reminders while the app is open too, but not the push about a finished analysis: the app
 * asks about the job instead (ANL-12). Creates or renames the `deadlines` and `analysis` channels.
 * Run at every start and after a language change: a channel's name and description can change,
 * nothing else can. Creating a channel asks for nothing (the app targets Android 13+), so the
 * permission dialog never appears at launch (REM-5); a push token needs one to exist first.
 */
export async function setUpNotifications(channels: {
  deadlines: NotificationChannel;
  analysis: NotificationChannel;
}) {
  setNotificationHandler({
    handleNotification: async (notification) => {
      const show = analysisJobOf(notification.request.content) === null;
      return {
        shouldShowBanner: show,
        shouldShowList: show,
        shouldPlaySound: show,
        shouldSetBadge: false,
      };
    },
  });
  if (process.env.EXPO_OS === 'android') {
    await setNotificationChannelAsync(DEADLINES_CHANNEL_ID, {
      ...channels.deadlines,
      importance: AndroidImportance.HIGH,
    });
    await setNotificationChannelAsync(ANALYSIS_CHANNEL_ID, {
      ...channels.analysis,
      importance: AndroidImportance.DEFAULT,
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
 * Removes the reminders already shown from the notification center: all of them are ours. With
 * «Details in notifications» (SET-5) they carry what a deadline is about.
 */
export async function dismissShownNotifications(): Promise<void> {
  await dismissAllNotificationsAsync();
}

/**
 * The reminder or analysis push behind a tap on its notification. Anything else is `null`: another
 * action than the tap itself (a dismiss action on iOS), or a notification without our ids.
 */
export function toOpenedNotification(response: NotificationResponse): OpenedNotification | null {
  if (response.actionIdentifier !== DEFAULT_ACTION_IDENTIFIER) return null;
  const { identifier, content } = response.notification.request;
  const jobId = analysisJobOf(content);
  if (jobId !== null) return { type: 'analysis', notificationId: identifier, jobId };
  const documentId = content.data?.documentId;
  const deadlineId = content.data?.deadlineId;
  if (typeof documentId !== 'string' || typeof deadlineId !== 'string') return null;
  return { type: 'reminder', notificationId: identifier, documentId, deadlineId };
}

/**
 * The last tap on one of our notifications, kept by the OS until cleared: the one that launched the
 * app at a cold start too, when no listener was there yet (REM-6, ANL-12).
 */
export function getLastOpenedNotification(): OpenedNotification | null {
  const response = getLastNotificationResponse();
  return response ? toOpenedNotification(response) : null;
}

/** Forgets the last tap, so that a later start or remount does not open its document again. */
export function clearLastOpenedNotification(): void {
  clearLastNotificationResponse();
}

/** Calls `listener` on every tap on our notifications while the app runs; returns the unsubscribe. */
export function addNotificationOpenedListener(listener: (opened: OpenedNotification) => void) {
  const subscription = addNotificationResponseReceivedListener((response) => {
    const opened = toOpenedNotification(response);
    if (opened) listener(opened);
  });
  return () => subscription.remove();
}

/**
 * Calls `listener` with the job of every push about a finished analysis that comes while the app is
 * open, which shows none of them (ANL-12); returns the unsubscribe.
 */
export function addAnalysisPushListener(listener: (jobId: string) => void) {
  const subscription = addNotificationReceivedListener((notification) => {
    const jobId = analysisJobOf(notification.request.content);
    if (jobId !== null) listener(jobId);
  });
  return () => subscription.remove();
}

/** The EAS project the push tokens belong to (`extra.eas.projectId` in app.json). */
function easProjectId(): string | undefined {
  return Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/**
 * Expo's token for this run, asked for once: each request goes to Expo's servers. A failure isn't
 * kept, so the next call asks again.
 */
let expoPushToken: Promise<string> | null = null;

/**
 * The Expo push token (`ExponentPushToken[…]`) the server sends the push about a finished analysis
 * to (ANL-12). Ask only with the permission granted. Fails without a network, without FCM in the
 * build (no `google-services.json`) or Google Play services, or without APNs.
 */
export function getPushToken(): Promise<string> {
  expoPushToken ??= getExpoPushTokenAsync({ projectId: easProjectId() }).then(
    (token) => token.data
  );
  const request = expoPushToken;
  request.catch(() => {
    if (expoPushToken === request) expoPushToken = null;
  });
  return request;
}

/**
 * Calls `listener` with the new Expo push token whenever the push service changes the device's
 * token while the app runs (ANL-12); returns the unsubscribe.
 */
export function addPushTokenChangeListener(listener: (token: string) => void) {
  const subscription = addPushTokenListener((devicePushToken) => {
    const request = getExpoPushTokenAsync({ projectId: easProjectId(), devicePushToken }).then(
      (token) => token.data
    );
    expoPushToken = request;
    request.then(listener, () => {
      if (expoPushToken === request) expoPushToken = null;
    });
  });
  return () => subscription.remove();
}

/** The app's page in system settings, where notifications are turned back on (REM-5). */
export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}
