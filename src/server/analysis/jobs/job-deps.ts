import {
  createServerDeps,
  positiveNumber,
  type ServerDeps,
  type ServerEnv,
} from '../../server-deps';
import { createLlmProvider } from '../create-llm-provider';
import { createPushSender } from './analysis-push';
import { AnalysisWorker } from './analysis-worker';

/** What the upload handler needs on top of the server's dependencies. */
export type AnalysisJobDeps = ServerDeps & {
  /** Runs the queued jobs; the upload wakes it up. */
  worker: Pick<AnalysisWorker, 'kick'>;
  /** Jobs the queue holds before uploads get `503` (`ANALYSIS_QUEUE_MAX`). */
  queueMax: number;
};

export type JobConfig = { concurrency: number; queueMax: number };

const DEFAULT_CONCURRENCY = 1;
const DEFAULT_QUEUE_MAX = 20;

/**
 * - `ANALYSIS_CONCURRENCY`: jobs analyzed at once, default 1: a model on a CPU answers one by one.
 * - `ANALYSIS_QUEUE_MAX`: queued jobs, default 20; each holds up to 20 MB of files (SPEC §7.1).
 */
export function readJobConfig(env: ServerEnv): JobConfig {
  return {
    concurrency: positiveNumber(env, 'ANALYSIS_CONCURRENCY', true) ?? DEFAULT_CONCURRENCY,
    queueMax: positiveNumber(env, 'ANALYSIS_QUEUE_MAX', true) ?? DEFAULT_QUEUE_MAX,
  };
}

// One worker per process, over the process's job store (`createServerDeps()`), for the same reason.
const shared = globalThis as typeof globalThis & { __docnavigatorAnalysisWorker?: AnalysisWorker };

/**
 * The upload handler's dependencies: the server's, the queue's size and the worker with the model
 * (`createLlmProvider()`) and the push sender (`createPushSender()`). The worker is made with the
 * first upload and lives as long as the process.
 */
export function createAnalysisJobDeps(env: ServerEnv = process.env): AnalysisJobDeps {
  const deps = createServerDeps(env);
  const { concurrency, queueMax } = readJobConfig(env);
  shared.__docnavigatorAnalysisWorker ??= new AnalysisWorker({
    store: deps.jobs,
    provider: createLlmProvider(env),
    usage: deps.usage,
    log: deps.log,
    now: deps.now,
    concurrency,
    push: createPushSender(env),
  });
  return { ...deps, worker: shared.__docnavigatorAnalysisWorker, queueMax };
}
