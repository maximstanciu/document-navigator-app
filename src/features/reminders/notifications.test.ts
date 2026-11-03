import type * as ExpoNotifications from 'expo-notifications';

// Every other test sees the fake OS (src/test/setup-native-modules.ts); this one tests the adapter.
jest.unmock('./notifications');

// What the adapter asks of the OS; the rest of `expo-notifications` stays as it is.
jest.mock('expo-notifications', () => ({
  ...jest.requireActual<typeof ExpoNotifications>('expo-notifications'),
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getExpoPushTokenAsync: jest.fn(),
  addPushTokenListener: jest.fn(),
}));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { eas: { projectId: 'eas-project' } } } },
}));

type Adapter = typeof import('./notifications');

/** A fresh adapter and the mocked library it sees: the adapter keeps the push token per run. */
function load(): { adapter: Adapter; os: jest.Mocked<typeof ExpoNotifications> } {
  let loaded!: ReturnType<typeof load>;
  jest.isolateModules(() => {
    loaded = {
      adapter: jest.requireActual<Adapter>('./notifications'),
      os: jest.requireMock<jest.Mocked<typeof ExpoNotifications>>('expo-notifications'),
    };
  });
  return loaded;
}

const { adapter } = load();
const { DEFAULT_ACTION_IDENTIFIER } =
  jest.requireActual<typeof ExpoNotifications>('expo-notifications');

// The OS's objects, with only the fields the adapter reads.
function notification(data: Record<string, unknown>, identifier = 'reminder-1') {
  return {
    date: 0,
    request: { identifier, content: { body: 'Deadline tomorrow', data } },
  } as unknown as ExpoNotifications.Notification;
}

function response(
  data: Record<string, unknown>,
  actionIdentifier: string = DEFAULT_ACTION_IDENTIFIER
) {
  return {
    actionIdentifier,
    notification: notification(data),
  } as unknown as ExpoNotifications.NotificationResponse;
}

describe('toOpenedNotification', () => {
  it('reads the ids of a tapped reminder (REM-6)', () => {
    expect(
      adapter.toOpenedNotification(response({ documentId: 'doc-1', deadlineId: 'pay' }))
    ).toEqual({
      type: 'reminder',
      notificationId: 'reminder-1',
      documentId: 'doc-1',
      deadlineId: 'pay',
    });
  });

  it('reads the job of a tapped push about a finished analysis (ANL-12)', () => {
    expect(adapter.toOpenedNotification(response({ type: 'analysis', jobId: 'job-1' }))).toEqual({
      type: 'analysis',
      notificationId: 'reminder-1',
      jobId: 'job-1',
    });
  });

  it('ignores actions other than the tap itself', () => {
    const dismissed = response(
      { documentId: 'doc-1', deadlineId: 'pay' },
      'com.apple.UNNotificationDismissActionIdentifier'
    );

    expect(adapter.toOpenedNotification(dismissed)).toBeNull();
  });

  it('ignores a notification without our ids', () => {
    expect(adapter.toOpenedNotification(response({}))).toBeNull();
    expect(
      adapter.toOpenedNotification(response({ documentId: 'doc-1', deadlineId: 7 }))
    ).toBeNull();
    expect(adapter.toOpenedNotification(response({ type: 'analysis', jobId: 7 }))).toBeNull();
  });
});

describe('setUpNotifications', () => {
  const channels = {
    deadlines: { name: 'Deadlines', description: 'Reminders' },
    analysis: { name: 'Document analysis', description: 'Analyzed' },
  };

  it('shows reminders while the app is open, but not the push about an analysis (ANL-12)', async () => {
    const { adapter, os } = load();
    await adapter.setUpNotifications(channels);

    const [[handler]] = os.setNotificationHandler.mock.calls;
    expect(await handler!.handleNotification(notification({ documentId: 'doc-1' }))).toEqual({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    });
    expect(
      await handler!.handleNotification(notification({ type: 'analysis', jobId: 'job-1' }))
    ).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});

describe('push token (ANL-12)', () => {
  const token = (data: string) => ({ type: 'expo' as const, data });

  it('asks Expo once per run, with the EAS project, and again after a failure', async () => {
    const { adapter, os } = load();
    os.getExpoPushTokenAsync
      .mockRejectedValueOnce(new Error('No FCM'))
      .mockResolvedValue(token('ExponentPushToken[one]'));

    await expect(adapter.getPushToken()).rejects.toThrow('No FCM');
    await expect(adapter.getPushToken()).resolves.toBe('ExponentPushToken[one]');
    await expect(adapter.getPushToken()).resolves.toBe('ExponentPushToken[one]');

    expect(os.getExpoPushTokenAsync).toHaveBeenCalledTimes(2);
    expect(os.getExpoPushTokenAsync).toHaveBeenLastCalledWith({
      projectId: 'eas-project',
    });
  });

  it('turns a new device token into the Expo token, which later calls get', async () => {
    const { adapter, os } = load();
    let deviceTokenChanged!: (token: ExpoNotifications.DevicePushToken) => void;
    os.addPushTokenListener.mockImplementation((listener) => {
      deviceTokenChanged = listener;
      return { remove: jest.fn() };
    });
    os.getExpoPushTokenAsync.mockResolvedValue(token('ExponentPushToken[new]'));
    const listener = jest.fn();
    adapter.addPushTokenChangeListener(listener);

    const devicePushToken = { type: 'android' as const, data: 'fcm-token' };
    deviceTokenChanged(devicePushToken);

    await expect(adapter.getPushToken()).resolves.toBe('ExponentPushToken[new]');
    expect(listener).toHaveBeenCalledWith('ExponentPushToken[new]');
    expect(os.getExpoPushTokenAsync).toHaveBeenCalledTimes(1);
    expect(os.getExpoPushTokenAsync).toHaveBeenCalledWith({
      projectId: 'eas-project',
      devicePushToken,
    });
  });
});
