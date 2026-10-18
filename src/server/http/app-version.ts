import { APP_VERSION_PATTERN } from '@/shared/api-headers';

export type AppVersion = readonly [major: number, minor: number, patch: number];

export function parseAppVersion(value: string | null | undefined): AppVersion | null {
  const match = value ? APP_VERSION_PATTERN.exec(value) : null;
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Negative if `a` is older than `b`, zero if equal, positive if newer. */
export function compareAppVersions(a: AppVersion, b: AppVersion): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
