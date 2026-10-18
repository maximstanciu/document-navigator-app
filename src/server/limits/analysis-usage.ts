import type { ClientPlatform } from '@/shared/api-headers';
import type { LimitsResponse } from '@/shared/limits-contract';

import { ApiFailure } from '../http/api-failure';
import type { ServerLog } from '../logs/server-log';
import {
  StoreUnavailableError,
  type CounterStore,
  type StoreCommand,
} from '../store/counter-store';
import { TTL_SECONDS, USAGE_KEYS as K, type EndCode } from './usage-keys';
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

/** One analysis request as the counters see it. `device` and `ip` are pseudonyms. */
export type UsageSession = {
  requestId: string;
  device: string;
  ip: string;
  platform: ClientPlatform;
  /** The UTC day the request started on; its end is counted on the same day. */
  day: string;
};

export type AnalysisOutcome = {
  code: EndCode;
  /** The device got an analysis: only then it counts against the daily limit. */
  charged: boolean;
  /** What the model call cost, if the model answered (even with an invalid analysis). */
  costUsd: number | null;
  hasDeadline: boolean;
};

/**
 * Daily limits, the budget and the beta's metric counters in one place (SPEC §8.3, §8.7), with two
 * round trips to the store per analysis.
 *
 * - `begin()` runs before the body is read: it counts the attempt for the IP address and the
 *   metrics, and checks the device's limit, the IP's attempts and the day's spend.
 * - `end()` runs once the outcome is known. The device is charged only for an analysis it got;
 *   a client that hung up never gets here (spike 0.2), so an interrupted analysis is free. The
 *   model's cost goes to the budget whenever the model answered.
 *
 * If the store can't be reached the analysis goes ahead (fail open) and `limits.unavailable` is
 * logged; the spending cap in the provider's console still holds (SPEC §8.3). Two requests of one
 * device at once can both pass its last analysis: a courtesy limit, not a lock.
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
  ): Promise<{ session: UsageSession; rejection: ApiFailure | null }> {
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
      return { session, rejection: null };
    }

    const analyses = Number(values[0] ?? 0);
    const spentMicroUsd = Number(values[1] ?? 0);
    const ipAttempts = Number(values[2] ?? 0);
    const { devicePerDay, ipPerHour, dailyBudgetUsd } = this.limits;

    let rejection: ApiFailure | null = null;
    if (analyses >= devicePerDay) {
      rejection = new ApiFailure('rate_limited', 'The daily limit of this device is used up.', {
        'Retry-After': String(secondsUntilNextDay(now)),
      });
    } else if (ipAttempts > ipPerHour) {
      rejection = new ApiFailure('rate_limited', 'Too many analyses from this network.', {
        'Retry-After': String(secondsUntilNextHour(now)),
      });
    } else if (dailyBudgetUsd !== null && spentMicroUsd >= dailyBudgetUsd * 1_000_000) {
      rejection = new ApiFailure('unavailable', 'The daily analysis budget is used up.', {
        'Retry-After': String(secondsUntilNextDay(now)),
      });
    }
    return { session, rejection };
  }

  async end(session: UsageSession, outcome: AnalysisOutcome): Promise<void> {
    const { day, device, platform } = session;
    const commands: StoreCommand[] = [...retained(['INCR', K.ended(day, platform, outcome.code)])];
    if (outcome.charged) {
      commands.push(
        ['INCR', K.device(day, device)],
        ['EXPIRE', K.device(day, device), TTL_SECONDS.device]
      );
    }
    const microUsd = Math.round((outcome.costUsd ?? 0) * 1_000_000);
    if (microUsd > 0) commands.push(...retained(['INCRBY', K.spend(day), microUsd]));
    if (outcome.hasDeadline) commands.push(...retained(['INCR', K.withDeadline(day)]));

    try {
      await this.store.run(commands);
    } catch (error) {
      this.unavailable(error, session, 'end');
    }
  }

  /** `GET /api/v1/limits`. Throws `StoreUnavailableError`: a guess would mislead the app. */
  async remaining(device: string): Promise<LimitsResponse> {
    const now = this.now();
    const [used] = await this.store.run([['GET', K.device(utcDay(now), device)]]);
    const { devicePerDay } = this.limits;
    return {
      dailyLimit: devicePerDay,
      remaining: Math.max(0, devicePerDay - Number(used ?? 0)),
      resetsAt: nextUtcMidnight(now),
    };
  }

  private unavailable(error: unknown, session: UsageSession, step: 'begin' | 'end') {
    if (!(error instanceof StoreUnavailableError)) throw error;
    this.log({ event: 'limits.unavailable', requestId: session.requestId, step });
  }
}

/** A command on a key that lives for the metrics retention, followed by its EXPIRE. */
function retained(command: StoreCommand): StoreCommand[] {
  return [command, ['EXPIRE', command[1], TTL_SECONDS.retained]];
}
