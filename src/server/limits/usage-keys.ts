import { ANALYZE_ERROR_CODES } from '@/shared/analysis/contract';

// Keys of the counters in the store. Limits count per UTC day or hour; metric counters and the
// spend live for METRICS_RETENTION_DAYS, long enough for the beta (SPEC §8.7). Device and IP parts
// are pseudonyms (src/server/privacy), never the raw values.

/** How an analysis ended, as `analyze.end` logs it: `ok`, a SPEC §7.2 code, or a crash. */
export const END_CODES = ['ok', ...ANALYZE_ERROR_CODES, 'internal'] as const;

export type EndCode = (typeof END_CODES)[number];

export const METRICS_RETENTION_DAYS = 90;

export const TTL_SECONDS = {
  device: 2 * 24 * 60 * 60,
  ip: 2 * 60 * 60,
  retained: METRICS_RETENTION_DAYS * 24 * 60 * 60,
};

export const USAGE_KEYS = {
  /** Analyses the device got that day. */
  device: (day: string, device: string) => `lim:dev:${day}:${device}`,
  /** Attempts from the IP address that hour. */
  ip: (hour: string, ip: string) => `lim:ip:${hour}:${ip}`,
  /** What the model cost that day, in micro-dollars (whole numbers for INCRBY). */
  spend: (day: string) => `spend:${day}`,
  started: (day: string, platform: string) => `m:${day}:start:${platform}`,
  ended: (day: string, platform: string, code: EndCode) => `m:${day}:end:${platform}:${code}`,
  /** Successful analyses that found at least one deadline. */
  withDeadline: (day: string) => `m:${day}:deadline`,
  /** Pseudonyms of the devices that tried an analysis that day. */
  devices: (day: string) => `m:${day}:devices`,
};
