// Limits and metrics count by UTC days and hours (SPEC §7.2: the daily limit resets at midnight
// UTC), so every isolate in every region agrees on the bucket.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** YYYY-MM-DD in UTC. */
export function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** YYYY-MM-DDTHH in UTC. */
export function utcHour(now: number): string {
  return new Date(now).toISOString().slice(0, 13);
}

/** The UTC day `days` before `day` (YYYY-MM-DD). */
export function daysBefore(day: string, days: number): string {
  return utcDay(Date.parse(`${day}T00:00:00Z`) - days * DAY_MS);
}

/** The next midnight UTC as an ISO timestamp, e.g. 2026-10-19T00:00:00Z. */
export function nextUtcMidnight(now: number): string {
  return `${utcDay(startOf(now, DAY_MS) + DAY_MS)}T00:00:00Z`;
}

/** Whole seconds until the next midnight UTC, at least 1: for `Retry-After`. */
export function secondsUntilNextDay(now: number): number {
  return Math.max(1, Math.ceil((startOf(now, DAY_MS) + DAY_MS - now) / 1000));
}

/** Whole seconds until the next full hour UTC, at least 1. */
export function secondsUntilNextHour(now: number): number {
  return Math.max(1, Math.ceil((startOf(now, HOUR_MS) + HOUR_MS - now) / 1000));
}

function startOf(now: number, period: number) {
  return Math.floor(now / period) * period;
}
