import type { JobEstimate } from './api';

const MINUTE_MS = 60_000;

/**
 * When an analysis ends, as the status panel says it (ANL-3): in whole minutes up to an hour, then
 * in whole hours, never less than one minute; `overdue` once the estimate has passed; `null`
 * without an estimate.
 */
export type Eta = { unit: 'minutes' | 'hours'; count: number } | 'overdue' | null;

/**
 * The time left of a job's estimate (`JobProgress`), seen at `now` (epoch ms). A clock read before
 * the check counts from the check, so a server that says the estimate has passed is believed at once.
 */
export function etaOf(
  { endsAt, checkedAt }: { endsAt: number | null; checkedAt: number },
  now: number
): Eta {
  if (endsAt === null) return null;
  const left = endsAt - Math.max(now, checkedAt);
  if (left <= 0) return 'overdue';
  const minutes = Math.max(1, Math.round(left / MINUTE_MS));
  return minutes < 60
    ? { unit: 'minutes', count: minutes }
    : { unit: 'hours', count: Math.round(minutes / 60) };
}

/**
 * How much of a job's estimate has passed at `now`, from 0 to 1, for the progress bar (ANL-3): the
 * time since the server accepted the job against all the time it expects, so the bar fills as the
 * time left counts down. `null` without an estimate or the job's start, and once the estimate has
 * passed, when the time left isn't known any more. The clock counts from the check, as in `etaOf`.
 */
export function progressOf(
  { endsAt, startedAt, checkedAt }: JobEstimate,
  now: number
): number | null {
  if (endsAt === null || startedAt === null) return null;
  const at = Math.max(now, checkedAt);
  if (at >= endsAt) return null;
  return (at - startedAt) / (endsAt - startedAt);
}
