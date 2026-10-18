import { DAILY_ANALYSES_PER_DEVICE } from '@/shared/limits';

import { AnalysisUsage, type UsageLimits } from '../limits/analysis-usage';
import type { LogEvent } from '../logs/server-log';
import type { ServerDeps } from '../server-deps';
import { MemoryCounterStore, type CounterStore } from '../store/counter-store';

/** 2026-10-18 12:00 UTC: the day the test requests are dated. */
export const TEST_NOW = Date.parse('2026-10-18T12:00:00Z');

export type TestServerDeps = ServerDeps & {
  /** What the handlers logged, in order. */
  events: LogEvent[];
  /** Moves the clock the counters and limits see. */
  advance: (ms: number) => void;
};

/**
 * Server dependencies for handler tests: counters in memory, a clock that only moves when told,
 * logs collected in `events`. `limits` and `store` can be replaced, e.g. with a failing store.
 */
export function testServerDeps({
  limits = {},
  store,
  metricsToken = null,
}: { limits?: Partial<UsageLimits>; store?: CounterStore; metricsToken?: string | null } = {}) {
  let time = TEST_NOW;
  const now = () => time;
  const events: LogEvent[] = [];
  const log = (event: LogEvent) => events.push(event);
  const counters = store ?? new MemoryCounterStore(now);
  const usage = new AnalysisUsage(
    counters,
    { devicePerDay: DAILY_ANALYSES_PER_DEVICE, ipPerHour: 60, dailyBudgetUsd: null, ...limits },
    log,
    now
  );
  const deps: TestServerDeps = {
    minAppVersion: null,
    deviceHashKey: 'test-key',
    log,
    now,
    store: counters,
    usage,
    metricsToken,
    events,
    advance: (ms) => {
      time += ms;
    },
  };
  return deps;
}
