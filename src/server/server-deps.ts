import { DAILY_ANALYSES_PER_DEVICE } from '@/shared/limits';

import { onJobExpired } from './analysis/jobs/analysis-job';
import { MemoryAnalysisJobStore, type AnalysisJobStore } from './analysis/jobs/job-store';
import { parseAppVersion, type AppVersion } from './http/app-version';
import { AnalysisUsage } from './limits/analysis-usage';
import { consoleServerLog, type ServerLog } from './logs/server-log';
import { MemoryCounterStore, type CounterStore } from './store/counter-store';
import { UpstashCounterStore } from './store/upstash-counter-store';

export type ServerEnv = Record<string, string | undefined>;

/** What every API route handler needs. Handlers take it as an argument so tests pass fakes. */
export type ServerDeps = {
  /** Older apps get `426 upgrade_required`; `null` serves every version. */
  minAppVersion: AppVersion | null;
  /** HMAC key that turns device ids and IP addresses into pseudonyms. */
  deviceHashKey: string;
  log: ServerLog;
  /** Milliseconds. On Workers the clock stands still during computation and moves across I/O. */
  now: () => number;
  store: CounterStore;
  usage: AnalysisUsage;
  /** The analysis jobs of this process: the queue and the results (SPEC §7.1). */
  jobs: AnalysisJobStore;
  /** Bearer token of `GET /api/v1/metrics`; `null` turns the route off. */
  metricsToken: string | null;
};

const DEVELOPMENT_HASH_KEY = 'docnavigator-development';
const DEFAULT_IP_ATTEMPTS_PER_HOUR = 60;
const DEFAULT_RESULT_TTL_HOURS = 24;
const HOUR_MS = 60 * 60 * 1000;
const MIN_METRICS_TOKEN_LENGTH = 32;

/**
 * Builds the dependencies from server environment variables (EAS environment variables on EAS
 * Hosting, `.env.local` in development). A misconfigured server fails loudly: the error names the
 * variable, never a value.
 *
 * - `MIN_APP_VERSION`: `major.minor.patch`; older apps get `426`. Unset — every version.
 * - `DEVICE_ID_HASH_KEY`: HMAC key for pseudonyms, a sensitive EAS variable on every deployment.
 *   Unset — a development key that anyone could reproduce.
 * - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`: the counter store (SPEC §8.3). Unset —
 *   counters in this process's memory, fine for the dev server only.
 * - `IP_ATTEMPTS_PER_HOUR`: default 60. `DAILY_BUDGET_USD`: unset — no cap.
 * - `METRICS_TOKEN`: at least 32 characters; unset — `GET /api/v1/metrics` answers 404.
 * - `ANALYSIS_RESULT_TTL_HOURS`: how long a finished job waits for the app, default 24.
 */
export function createServerDeps(env: ServerEnv = process.env): ServerDeps {
  const log = consoleServerLog;
  const now = Date.now;
  const store = createStore(env);
  const limits = {
    devicePerDay: DAILY_ANALYSES_PER_DEVICE,
    ipPerHour: positiveNumber(env, 'IP_ATTEMPTS_PER_HOUR', true) ?? DEFAULT_IP_ATTEMPTS_PER_HOUR,
    dailyBudgetUsd: positiveNumber(env, 'DAILY_BUDGET_USD', false),
  };
  const usage = new AnalysisUsage(store, limits, log, now);
  const resultTtlHours =
    positiveNumber(env, 'ANALYSIS_RESULT_TTL_HOURS', false) ?? DEFAULT_RESULT_TTL_HOURS;
  shared.__docnavigatorAnalysisJobs ??= new MemoryAnalysisJobStore({
    now,
    resultTtlMs: resultTtlHours * HOUR_MS,
    onExpired: onJobExpired({ log, usage }),
  });
  return {
    minAppVersion: readMinAppVersion(env),
    deviceHashKey: env.DEVICE_ID_HASH_KEY || DEVELOPMENT_HASH_KEY,
    log,
    now,
    store,
    usage,
    jobs: shared.__docnavigatorAnalysisJobs,
    metricsToken: readMetricsToken(env),
  };
}

// One per process: the dev server keeps its counters between requests, and every route sees the
// same analysis jobs. On globalThis rather than in this module: the dev server and the Node
// adapter load each route's bundle separately, module state and all.
const shared = globalThis as typeof globalThis & {
  __docnavigatorCounters?: MemoryCounterStore;
  __docnavigatorAnalysisJobs?: AnalysisJobStore;
};

function createStore(env: ServerEnv): CounterStore {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new UpstashCounterStore({ url, token });
  if (url || token) {
    throw new Error('Set both UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN, or neither.');
  }
  shared.__docnavigatorCounters ??= new MemoryCounterStore();
  return shared.__docnavigatorCounters;
}

export function positiveNumber(env: ServerEnv, name: string, whole: boolean): number | null {
  const raw = env[name];
  if (!raw) return null;
  const value = Number(raw);
  if (!(value > 0) || (whole && !Number.isInteger(value))) {
    throw new Error(`${name} must be a positive ${whole ? 'whole ' : ''}number.`);
  }
  return value;
}

function readMinAppVersion(env: ServerEnv) {
  if (!env.MIN_APP_VERSION) return null;
  const version = parseAppVersion(env.MIN_APP_VERSION);
  if (!version) throw new Error('MIN_APP_VERSION must be major.minor.patch.');
  return version;
}

function readMetricsToken(env: ServerEnv) {
  if (!env.METRICS_TOKEN) return null;
  if (env.METRICS_TOKEN.length < MIN_METRICS_TOKEN_LENGTH) {
    throw new Error(`METRICS_TOKEN must be at least ${MIN_METRICS_TOKEN_LENGTH} characters.`);
  }
  return env.METRICS_TOKEN;
}
