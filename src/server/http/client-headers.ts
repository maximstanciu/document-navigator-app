import {
  API_HEADERS,
  isClientPlatform,
  isDeviceId,
  type ClientPlatform,
} from '@/shared/api-headers';

import { ApiFailure } from './api-failure';
import { compareAppVersions, parseAppVersion, type AppVersion } from './app-version';

export type ClientHeaders = {
  deviceId: string;
  appVersion: AppVersion;
  platform: ClientPlatform;
};

/**
 * Reads the headers every API call carries (SPEC §7.2). The app version is checked first, so an
 * old app is told to update (426) even if it sends the other headers differently.
 */
export function readClientHeaders(
  headers: Headers,
  minAppVersion: AppVersion | null
): ClientHeaders {
  const appVersion = parseAppVersion(headers.get(API_HEADERS.appVersion));
  if (!appVersion) {
    throw new ApiFailure('invalid_request', `${API_HEADERS.appVersion} must be major.minor.patch.`);
  }
  if (minAppVersion && compareAppVersions(appVersion, minAppVersion) < 0) {
    throw new ApiFailure(
      'upgrade_required',
      `App versions below ${minAppVersion.join('.')} are not supported.`
    );
  }

  const platform = headers.get(API_HEADERS.platform);
  if (!isClientPlatform(platform)) {
    throw new ApiFailure('invalid_request', `${API_HEADERS.platform} must be ios, android or web.`);
  }

  const deviceId = headers.get(API_HEADERS.deviceId);
  if (!isDeviceId(deviceId)) {
    throw new ApiFailure('invalid_request', `${API_HEADERS.deviceId} must be a UUID v4.`);
  }

  return { deviceId, appVersion, platform };
}
