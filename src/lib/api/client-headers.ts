import Constants from 'expo-constants';

import { getDeviceId } from '@/lib/device-id';
import { API_HEADERS, type ClientPlatform } from '@/shared/api-headers';

/**
 * Headers every call to this app's API routes carries (SPEC §7.2): the device id for daily limits,
 * the app version for `426 upgrade_required` and the platform. The version is the one in `app.json`.
 */
export async function getClientHeaders(): Promise<Record<string, string>> {
  return {
    [API_HEADERS.deviceId]: await getDeviceId(),
    // Always set in a build; a missing one reads as the oldest version rather than a malformed header.
    [API_HEADERS.appVersion]: Constants.expoConfig?.version ?? '0.0.0',
    [API_HEADERS.platform]: process.env.EXPO_OS as ClientPlatform,
  };
}
