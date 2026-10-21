import { DAILY_ANALYSES_PER_DEVICE } from '@/shared/limits';

import { onJobExpired } from '../analysis/jobs/analysis-job';
import { AnalysisWorker } from '../analysis/jobs/analysis-worker';
import type { AnalysisJobDeps } from '../analysis/jobs/job-deps';
import { MemoryAnalysisJobStore } from '../analysis/jobs/job-store';
import type { LlmProvider } from '../analysis/llm-provider';
import { MockLlmProvider } from '../analysis/providers/mock-llm-provider';
import { AnalysisUsage, type UsageLimits } from '../limits/analysis-usage';
import type { LogEvent } from '../logs/server-log';
import type { ServerDeps } from '../server-deps';
import { MemoryCounterStore, type CounterStore } from '../store/counter-store';

/** 2026-10-18 12:00 UTC: the day the test requests are dated. */
export const TEST_NOW = Date.parse('2026-10-18T12:00:00Z');

export const TEST_RESULT_TTL_MS = 24 * 60 * 60 * 1000;

export type TestServerDeps = ServerDeps & {
  /** What the handlers logged, in order. */
  events: LogEvent[];
  /** Moves the clock the counters, limits and jobs see. */
  advance: (ms: number) => void;
};

/**
 * Server dependencies for handler tests: counters and jobs in memory, a clock that only moves when
 * told, logs collected in `events`. `limits` and `store` can be replaced, e.g. with a failing store.
 */
export function testServerDeps({
  limits = {},
  store,
  metricsToken = null,
  resultTtlMs = TEST_RESULT_TTL_MS,
}: {
  limits?: Partial<UsageLimits>;
  store?: CounterStore;
  metricsToken?: string | null;
  resultTtlMs?: number;
} = {}) {
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
    jobs: new MemoryAnalysisJobStore({ now, resultTtlMs, onExpired: onJobExpired({ log, usage }) }),
    metricsToken,
    events,
    advance: (ms) => {
      time += ms;
    },
  };
  return deps;
}

export type TestJobDeps = TestServerDeps & AnalysisJobDeps & { worker: AnalysisWorker };

/**
 * `testServerDeps()` with the upload handler's own: a worker over the test jobs with `provider`
 * (by default `MockLlmProvider` without a delay) and the queue's size.
 */
export function testJobDeps({
  provider = new MockLlmProvider(),
  concurrency = 1,
  queueMax = 20,
  ...server
}: Parameters<typeof testServerDeps>[0] & {
  provider?: LlmProvider;
  concurrency?: number;
  queueMax?: number;
} = {}): TestJobDeps {
  const deps = testServerDeps(server);
  const worker = new AnalysisWorker({
    store: deps.jobs,
    provider,
    usage: deps.usage,
    log: deps.log,
    now: deps.now,
    concurrency,
  });
  return { ...deps, worker, queueMax };
}
