import { fakeNotifications, getPushToken } from '@/test/fake-notifications';

import { PUSH_TOKEN_TIMEOUT_MS, pushTokenIfAllowed } from './push-token';

afterEach(() => jest.useRealTimers());

describe('pushTokenIfAllowed (ANL-12)', () => {
  it('gives the Expo push token when notifications are allowed', async () => {
    fakeNotifications.permission = 'granted';

    await expect(pushTokenIfAllowed()).resolves.toBe('ExponentPushToken[fake-device]');
  });

  it('gives none without the permission, and does not ask the OS for a token', async () => {
    for (const permission of ['undetermined', 'denied', 'unavailable'] as const) {
      fakeNotifications.permission = permission;
      await expect(pushTokenIfAllowed()).resolves.toBeNull();
    }
    expect(getPushToken).not.toHaveBeenCalled();
  });

  it('gives none when the OS fails to give one, or gives something else', async () => {
    fakeNotifications.permission = 'granted';
    fakeNotifications.pushToken = null;
    await expect(pushTokenIfAllowed()).resolves.toBeNull();

    fakeNotifications.pushToken = 'not-a-token';
    await expect(pushTokenIfAllowed()).resolves.toBeNull();
  });

  it('stops waiting for a token Expo does not give in time', async () => {
    jest.useFakeTimers();
    fakeNotifications.permission = 'granted';
    getPushToken.mockReturnValueOnce(new Promise(() => {}));

    const token = pushTokenIfAllowed();
    await jest.advanceTimersByTimeAsync(PUSH_TOKEN_TIMEOUT_MS);

    await expect(token).resolves.toBeNull();
  });
});
