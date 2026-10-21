import { isUuidV4 } from './uuid';

// Headers every call to this app's API routes carries (SPEC §7.2). The server checks the app
// version (426) and, from task 3.4, counts daily limits per device.

export const API_HEADERS = {
  deviceId: 'X-Device-Id',
  appVersion: 'X-App-Version',
  platform: 'X-Platform',
} as const;

export const CLIENT_PLATFORMS = ['ios', 'android', 'web'] as const;

export type ClientPlatform = (typeof CLIENT_PLATFORMS)[number];

export function isClientPlatform(value: unknown): value is ClientPlatform {
  return CLIENT_PLATFORMS.includes(value as ClientPlatform);
}

/** The device id is a UUID v4 (SPEC §6.2). */
export function isDeviceId(value: unknown): value is string {
  return isUuidV4(value);
}

/** `X-App-Version` is the app's `major.minor.patch` version from `app.json`. */
export const APP_VERSION_PATTERN = /^(\d{1,5})\.(\d{1,5})\.(\d{1,5})$/;
