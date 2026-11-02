import { CLIENT_PLATFORMS, type ClientPlatform } from '@/shared/api-headers';

import {
  JOB_END_CODES,
  METRICS_RETENTION_DAYS,
  PUSH_OUTCOMES,
  UPLOAD_END_CODES,
  USAGE_KEYS as K,
  type JobEndCode,
  type PushOutcome,
  type UploadEndCode,
} from '../limits/usage-keys';
import { daysBefore, utcDay } from '../limits/utc-time';
import type { CounterStore, StoreCommand } from '../store/counter-store';

type Counts = { started: number; ended: number; interrupted: number };

/** Server-side beta metrics of one UTC day (SPEC §8.7): counts, and shares where they are defined. */
export type DayMetrics = {
  day: string;
  /** Uploads that passed the client headers check, and those of them that got an answer. */
  started: number;
  ended: number;
  /** Started without an end: the upload broke off (`network` on the app's side). */
  interrupted: number;
  byPlatform: Record<ClientPlatform, Counts>;
  /** How the uploads ended: `accepted` into the queue, or refused with a SPEC §7.2 code. */
  uploads: Record<UploadEndCode, number>;
  /** How the jobs accepted that day ended. */
  jobs: Record<JobEndCode, number>;
  /** Accepted jobs without an end: lost when the server restarted (today: also still queued). */
  lost: number;
  /** Results the app got, and those nobody fetched in time. */
  delivered: number;
  expired: number;
  /** Successful analyses that found a deadline. */
  withDeadline: number;
  /** How the pushes about the jobs went (ANL-12). */
  pushes: Record<PushOutcome, number>;
  /** Devices that tried an analysis, and those of them seen 7 or more days earlier too. */
  devices: number;
  returningDevices: number;
  costUsd: number;
  shares: {
    interrupted: number | null;
    /** Of the accepted jobs: lost on a restart or not fetched in time. */
    lost: number | null;
    withDeadline: number | null;
    /** Of the uploads that got an answer: `429` of either kind. */
    rateLimited: number | null;
    /** Of the jobs that ended. */
    analysisFailed: number | null;
    /** Of the uploads that got an answer: `503`, or a job that couldn't reach the model. */
    unavailable: number | null;
  };
};

const RETURNING_AFTER_DAYS = 7;

/**
 * Reads the counters of the last `days` UTC days, newest first, in one round trip. Device sets
 * are read for the whole retention so a device that came back after a week is recognized.
 */
export async function readBetaReport(
  store: CounterStore,
  now: number,
  days: number
): Promise<DayMetrics[]> {
  const today = utcDay(now);
  const reportDays = Array.from({ length: days }, (_, i) => daysBefore(today, i));
  const setDays = Array.from({ length: METRICS_RETENTION_DAYS }, (_, i) => daysBefore(today, i));

  const commands: StoreCommand[] = [];
  const at = new Map<string, number>();
  const read = (command: StoreCommand) => {
    at.set(command[1], commands.length);
    commands.push(command);
  };
  for (const day of reportDays) {
    for (const platform of CLIENT_PLATFORMS) {
      read(['GET', K.started(day, platform)]);
      for (const code of UPLOAD_END_CODES) read(['GET', K.ended(day, platform, code)]);
    }
    for (const code of JOB_END_CODES) read(['GET', K.job(day, code)]);
    read(['GET', K.delivered(day)]);
    read(['GET', K.expired(day)]);
    read(['GET', K.withDeadline(day)]);
    for (const outcome of PUSH_OUTCOMES) read(['GET', K.push(day, outcome)]);
    read(['GET', K.spend(day)]);
  }
  for (const day of setDays) read(['SMEMBERS', K.devices(day)]);

  const values = await store.run(commands);
  const count = (key: string) => Number(values[at.get(key)!] ?? 0);
  const members = (day: string) => new Set(values[at.get(K.devices(day))!] as string[]);

  return reportDays.map((day) => {
    const byPlatform = Object.fromEntries(
      CLIENT_PLATFORMS.map((platform) => {
        const started = count(K.started(day, platform));
        const ended = UPLOAD_END_CODES.reduce(
          (sum, code) => sum + count(K.ended(day, platform, code)),
          0
        );
        return [platform, { started, ended, interrupted: Math.max(0, started - ended) }];
      })
    ) as Record<ClientPlatform, Counts>;
    const uploads = Object.fromEntries(
      UPLOAD_END_CODES.map((code) => [
        code,
        CLIENT_PLATFORMS.reduce((sum, platform) => sum + count(K.ended(day, platform, code)), 0),
      ])
    ) as Record<UploadEndCode, number>;
    const jobs = Object.fromEntries(
      JOB_END_CODES.map((code) => [code, count(K.job(day, code))])
    ) as Record<JobEndCode, number>;

    const total = (field: keyof Counts) =>
      CLIENT_PLATFORMS.reduce((sum, platform) => sum + byPlatform[platform][field], 0);
    const started = total('started');
    const ended = total('ended');
    const interrupted = total('interrupted');
    const jobsEnded = JOB_END_CODES.reduce((sum, code) => sum + jobs[code], 0);
    const lost = Math.max(0, uploads.accepted - jobsEnded);
    const expired = count(K.expired(day));
    const withDeadline = count(K.withDeadline(day));

    const devices = members(day);
    const earlier = new Set(
      setDays
        .filter((other) => other <= daysBefore(day, RETURNING_AFTER_DAYS))
        .flatMap((other) => [...members(other)])
    );

    return {
      day,
      started,
      ended,
      interrupted,
      byPlatform,
      uploads,
      jobs,
      lost,
      delivered: count(K.delivered(day)),
      expired,
      withDeadline,
      pushes: Object.fromEntries(
        PUSH_OUTCOMES.map((outcome) => [outcome, count(K.push(day, outcome))])
      ) as Record<PushOutcome, number>,
      devices: devices.size,
      returningDevices: [...devices].filter((device) => earlier.has(device)).length,
      costUsd: count(K.spend(day)) / 1_000_000,
      shares: {
        interrupted: share(interrupted, started),
        lost: share(lost + expired, uploads.accepted),
        withDeadline: share(withDeadline, jobs.ok),
        rateLimited: share(uploads.rate_limited + uploads.too_many_jobs, ended),
        analysisFailed: share(jobs.analysis_failed, jobsEnded),
        unavailable: share(uploads.unavailable + jobs.unavailable, ended),
      },
    };
  });
}

function share(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}
