import type { ClientPlatform } from '@/shared/api-headers';
import { ACTIVE_JOBS_PER_DEVICE } from '@/shared/limits';
import type { LimitsResponse } from '@/shared/limits-contract';

import { ApiFailure } from '../http/api-failure';
import type { ServerLog } from '../logs/server-log';
import {
  StoreUnavailableError,
  type CounterStore,
  type StoreCommand,
} from '../store/counter-store';
import {
  TTL_SECONDS,
  USAGE_KEYS as K,
  type JobEndCode,
  type PushOutcome,
  type UploadEndCode,
} from './usage-keys';
import {
  nextUtcMidnight,
  secondsUntilNextDay,
  secondsUntilNextHour,
  utcDay,
  utcHour,
} from './utc-time';

export type UsageLimits = {
  /** Analyses per device per UTC day (SPEC §8.3). */
  devicePerDay: number;
  /** Attempts per IP address per UTC hour; generous, since mobile networks share addresses. */
  ipPerHour: number;
  /** Model spend per UTC day after which analysis answers 503; `null` — no cap. */
  dailyBudgetUsd: number | null;
};

/** One upload and the job it creates, as the counters see them. `device` and `ip` are pseudonyms. */
export type UsageSession = {
  requestId: string;
  device: string;
  ip: string;
  platform: ClientPlatform;
  /** The UTC day the upload started on; the upload's and the job's ends are counted on it too. */
  day: string;
};

/** What the store knew when the upload started. */
export type UsageCounts = {
  /** Analyses the device got today. */
  analyses: number;
  /** Attempts from the IP address this hour, this one included. */
  ipAttempts: number;
  spentMicroUsd: number;
};

export type JobOutcome = {
  code: JobEndCode;
  /** What the model call cost, if the model answered (even with an invalid analysis). */
  costUsd: number | null;
  hasDeadline: boolean;
};

/**
 * Daily limits, the budget and the beta's metric counters in one place (SPEC §8.3, §8.7).
 *
 * - `begin()` runs before the body of an upload is read: it counts the attempt for the IP address
 *   and the metrics, and reads what the device got today and what the day cost. `rejection()`
 *   then checks the limits against those counts and the device's unfinished jobs.
 * - `uploadEnded()` and `jobEnded()` count the outcomes; the model's cost goes to the budget
 *   whenever the model answered.
 * - `delivered()` charges the device, once per job, when the app first gets a result: a refused
 *   upload, a failed, cancelled or lost job and a result nobody fetched cost the device nothing.
 * - `expired()` and `pushSent()` count results nobody fetched and how the pushes went.
 *
 * If the store can't be reached the analysis goes ahead (fail open) and `limits.unavailable` is
 * logged; the spending cap in the provider's console still holds (SPEC §8.3).
 */
export class AnalysisUsage {
  constructor(
    private readonly store: CounterStore,
    private readonly limits: UsageLimits,
    private readonly log: ServerLog,
    private readonly now: () => number
  ) {}

  async begin(
    client: Omit<UsageSession, 'day'>
  ): Promise<{ session: UsageSession; counts: UsageCounts | null }> {
    const now = this.now();
    const session: UsageSession = { ...client, day: utcDay(now) };
    const { day, device, ip, platform } = session;
    const ipKey = K.ip(utcHour(now), ip);

    let values;
    try {
      values = await this.store.run([
        ['GET', K.device(day, device)],
        ['GET', K.spend(day)],
        ['INCR', ipKey],
        ['EXPIRE', ipKey, TTL_SECONDS.ip],
        ...retained(['INCR', K.started(day, platform)]),
        ...retained(['SADD', K.devices(day), device]),
      ]);
    } catch (error) {
      this.unavailable(error, session, 'begin');
      return { session, counts: null };
    }
    const counts: UsageCounts = {
      analyses: Number(values[0] ?? 0),
      spentMicroUsd: Number(values[1] ?? 0),
      ipAttempts: Number(values[2] ?? 0),
    };
    return { session, counts };
  }

  /**
   * The first limit an upload runs into, in the order of SPEC §7.2, or `null`. `unfinished` is the
   * device's jobs that haven't been fetched yet: counted with today's analyses, they keep jobs in
   * parallel from passing the daily limit (SPEC §8.3). Without `counts` (the store is down) only
   * the device's jobs are checked.
   */
  rejection(counts: UsageCounts | null, unfinished: number): ApiFailure | null {
    const now = this.now();
    const { devicePerDay, ipPerHour, dailyBudgetUsd } = this.limits;
    if (counts && counts.analyses + unfinished >= devicePerDay) {
      return new ApiFailure('rate_limited', 'The daily limit of this device is used up.', {
        'Retry-After': String(secondsUntilNextDay(now)),
      });
    }
    if (counts && counts.ipAttempts > ipPerHour) {
      return new ApiFailure('rate_limited', 'Too many analyses from this network.', {
        'Retry-After': String(secondsUntilNextHour(now)),
      });
    }
    if (unfinished >= ACTIVE_JOBS_PER_DEVICE) {
      return new ApiFailure(
        'too_many_jobs',
        `This device has ${ACTIVE_JOBS_PER_DEVICE} unfinished analyses already.`
      );
    }
    if (counts && dailyBudgetUsd !== null && counts.spentMicroUsd >= dailyBudgetUsd * 1_000_000) {
      return new ApiFailure('unavailable', 'The daily analysis budget is used up.', {
        'Retry-After': String(secondsUntilNextDay(now)),
      });
    }
    return null;
  }

  async uploadEnded(session: UsageSession, code: UploadEndCode): Promise<void> {
    const { day, platform } = session;
    await this.run(session, 'upload', retained(['INCR', K.ended(day, platform, code)]));
  }

  async jobEnded(session: UsageSession, outcome: JobOutcome): Promise<void> {
    const { day } = session;
    const commands: StoreCommand[] = [...retained(['INCR', K.job(day, outcome.code)])];
    // The budget is per day of spending, which for a job that waited may be after the upload's.
    const microUsd = Math.round((outcome.costUsd ?? 0) * 1_000_000);
    if (microUsd > 0) {
      commands.push(...retained(['INCRBY', K.spend(utcDay(this.now())), microUsd]));
    }
    if (outcome.hasDeadline) commands.push(...retained(['INCR', K.withDeadline(day)]));
    await this.run(session, 'job', commands);
  }

  /** The app got the result: today's limit of the device is charged (SPEC §8.3). */
  async delivered(session: UsageSession): Promise<void> {
    const deviceKey = K.device(utcDay(this.now()), session.device);
    await this.run(session, 'delivered', [
      ['INCR', deviceKey],
      ['EXPIRE', deviceKey, TTL_SECONDS.device],
      ...retained(['INCR', K.delivered(session.day)]),
    ]);
  }

  /** Nobody fetched the result in time. */
  async expired(session: UsageSession): Promise<void> {
    await this.run(session, 'expired', retained(['INCR', K.expired(session.day)]));
  }

  /** The push about the job's end went out, or why not (ANL-12). */
  async pushSent(session: UsageSession, outcome: PushOutcome): Promise<void> {
    await this.run(session, 'push', retained(['INCR', K.push(session.day, outcome)]));
  }

  /**
   * `GET /api/v1/limits`: the daily limit less today's analyses and the device's `unfinished`
   * jobs. Throws `StoreUnavailableError`: a guess would mislead the app.
   */
  async remaining(device: string, unfinished: number): Promise<LimitsResponse> {
    const now = this.now();
    const [used] = await this.store.run([['GET', K.device(utcDay(now), device)]]);
    const { devicePerDay } = this.limits;
    return {
      dailyLimit: devicePerDay,
      remaining: Math.max(0, devicePerDay - Number(used ?? 0) - unfinished),
      resetsAt: nextUtcMidnight(now),
    };
  }

  private async run(session: UsageSession, step: string, commands: StoreCommand[]) {
    try {
      await this.store.run(commands);
    } catch (error) {
      this.unavailable(error, session, step);
    }
  }

  private unavailable(error: unknown, session: UsageSession, step: string) {
    if (!(error instanceof StoreUnavailableError)) throw error;
    this.log({ event: 'limits.unavailable', requestId: session.requestId, step });
  }
}

/** A command on a key that lives for the metrics retention, followed by its EXPIRE. */
function retained(command: StoreCommand): StoreCommand[] {
  return [command, ['EXPIRE', command[1], TTL_SECONDS.retained]];
}
