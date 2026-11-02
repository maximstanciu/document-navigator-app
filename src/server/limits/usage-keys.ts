import type { ApiErrorCode } from '@/shared/analysis/contract';

// Keys of the counters in the store. Limits count per UTC day or hour; metric counters and the
// spend live for METRICS_RETENTION_DAYS, long enough for the beta (SPEC §8.7). Device and IP parts
// are pseudonyms (src/server/privacy), never the raw values.

/**
 * How an upload ended, as `upload.end` logs it: `accepted` into the queue, `existing` when the job
 * was there already (a repeated upload, ANL-9), a SPEC §7.2 code, or a crash.
 */
export const UPLOAD_END_CODES = [
  'accepted',
  'existing',
  ...([
    'invalid_request',
    'too_large',
    'encrypted_pdf',
    'invalid_pdf',
    'rate_limited',
    'too_many_jobs',
    'unavailable',
  ] as const satisfies readonly ApiErrorCode[]),
  'internal',
] as const;

export type UploadEndCode = (typeof UPLOAD_END_CODES)[number];

/** Codes an upload can end with after its limits were checked; the counters keep only these. */
export function isUploadEndCode(value: unknown): value is UploadEndCode {
  return UPLOAD_END_CODES.includes(value as UploadEndCode);
}

/** How an accepted job ended, as `analysis.end` logs it (SPEC §7.1). */
export const JOB_END_CODES = [
  'ok',
  'analysis_failed',
  'unavailable',
  'cancelled',
  'internal',
] as const;

export type JobEndCode = (typeof JOB_END_CODES)[number];

/**
 * Error codes of Expo Push Service kept as they are (SPEC §7.1): of the whole request, then of the
 * push ticket. Any other code is `unexpected`.
 */
export const EXPO_PUSH_ERRORS = [
  'UNAUTHORIZED',
  'TOO_MANY_REQUESTS',
  'DeviceNotRegistered',
  'MessageTooBig',
  'MessageRateExceeded',
  'MismatchSenderId',
  'InvalidCredentials',
] as const;

/**
 * How the push about a finished job went, as `push.sent` logs it (ANL-12, SPEC §7.1): `ok` once
 * Expo took it, `network` and `server_error` when even the retry got no answer or a `5xx`.
 */
export const PUSH_OUTCOMES = [
  'ok',
  'network',
  'server_error',
  ...EXPO_PUSH_ERRORS,
  'unexpected',
] as const;

export type PushOutcome = (typeof PUSH_OUTCOMES)[number];

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
  /** Uploads that passed the client headers check, and how they ended. */
  started: (day: string, platform: string) => `m:${day}:start:${platform}`,
  ended: (day: string, platform: string, code: UploadEndCode) => `m:${day}:end:${platform}:${code}`,
  /** How the jobs accepted that day ended. */
  job: (day: string, code: JobEndCode) => `m:${day}:job:${code}`,
  /** Results of that day's jobs the app got, and those nobody fetched in time. */
  delivered: (day: string) => `m:${day}:delivered`,
  expired: (day: string) => `m:${day}:expired`,
  /** Successful analyses that found at least one deadline. */
  withDeadline: (day: string) => `m:${day}:deadline`,
  /** How the pushes about that day's jobs went. */
  push: (day: string, outcome: PushOutcome) => `m:${day}:push:${outcome}`,
  /** Pseudonyms of the devices that tried an analysis that day. */
  devices: (day: string) => `m:${day}:devices`,
};
