import { CLIENT_PLATFORMS, type ClientPlatform } from '@/shared/api-headers';

import {
  END_CODES,
  METRICS_RETENTION_DAYS,
  USAGE_KEYS as K,
  type EndCode,
} from '../limits/usage-keys';
import { daysBefore, utcDay } from '../limits/utc-time';
import type { CounterStore, StoreCommand } from '../store/counter-store';

type Counts = { started: number; ended: number; interrupted: number };

/** Server-side beta metrics of one UTC day (SPEC §8.7): counts, and shares where they are defined. */
export type DayMetrics = {
  day: string;
  /** Requests that passed the client headers check, and those of them that reached an end. */
  started: number;
  ended: number;
  /** Started without an end: the client hung up (`network`, `interrupted` on the app's side). */
  interrupted: number;
  byPlatform: Record<ClientPlatform, Counts>;
  outcomes: Record<EndCode, number>;
  /** Successful analyses that found a deadline. */
  withDeadline: number;
  /** Devices that tried an analysis, and those of them seen 7 or more days earlier too. */
  devices: number;
  returningDevices: number;
  costUsd: number;
  shares: {
    interrupted: number | null;
    withDeadline: number | null;
    rateLimited: number | null;
    analysisFailed: number | null;
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
      for (const code of END_CODES) read(['GET', K.ended(day, platform, code)]);
    }
    read(['GET', K.withDeadline(day)]);
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
        const ended = END_CODES.reduce((sum, code) => sum + count(K.ended(day, platform, code)), 0);
        return [platform, { started, ended, interrupted: Math.max(0, started - ended) }];
      })
    ) as Record<ClientPlatform, Counts>;
    const outcomes = Object.fromEntries(
      END_CODES.map((code) => [
        code,
        CLIENT_PLATFORMS.reduce((sum, platform) => sum + count(K.ended(day, platform, code)), 0),
      ])
    ) as Record<EndCode, number>;

    const total = (field: keyof Counts) =>
      CLIENT_PLATFORMS.reduce((sum, platform) => sum + byPlatform[platform][field], 0);
    const started = total('started');
    const ended = total('ended');
    const interrupted = total('interrupted');
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
      outcomes,
      withDeadline,
      devices: devices.size,
      returningDevices: [...devices].filter((device) => earlier.has(device)).length,
      costUsd: count(K.spend(day)) / 1_000_000,
      shares: {
        interrupted: share(interrupted, started),
        withDeadline: share(withDeadline, outcomes.ok),
        rateLimited: share(outcomes.rate_limited, ended),
        analysisFailed: share(outcomes.analysis_failed, ended),
        unavailable: share(outcomes.unavailable, ended),
      },
    };
  });
}

function share(part: number, whole: number) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null;
}
