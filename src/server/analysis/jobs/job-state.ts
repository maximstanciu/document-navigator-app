import type { AnalysisJobState } from '@/shared/analysis/contract';

import type { AnalysisJob, JobFailureCode } from './analysis-job';
import type { JobDurations } from './job-durations';
import type { AnalysisJobStore } from './job-store';

/** What tells where a job stands: the queue, how long analyses take, and the clock. */
export type JobQueue = {
  jobs: Pick<AnalysisJobStore, 'before'>;
  durations: Pick<JobDurations, 'estimate'>;
  now: () => number;
};

const FAILURE_MESSAGES: Record<JobFailureCode, string> = {
  analysis_failed: 'The model returned an invalid analysis.',
  unavailable: 'The analysis service is unavailable.',
};

/** What GET and PUT answer about a job (SPEC §7.2). */
export function jobState(job: AnalysisJob, queue: JobQueue): AnalysisJobState {
  const { result } = job;
  if (result?.status === 'done') return { status: 'done', ...result.response };
  if (result?.status === 'failed') {
    return {
      status: 'failed',
      error: { code: result.code, message: FAILURE_MESSAGES[result.code] },
    };
  }
  if (job.status === 'processing') {
    return { status: 'processing', etaSeconds: etaSeconds(job, [], queue) };
  }
  const before = queue.jobs.before(job);
  return { status: 'queued', ahead: before.length, etaSeconds: etaSeconds(job, before, queue) };
}

/**
 * Seconds until `job` ends, by how long analyses took lately (ANL-3): what is left of a running
 * job, and for a queued one the jobs `before` it too; `null` with nothing to go by. A running job
 * past its estimate has `0` left.
 *
 * A queued job waits because every place of the worker is taken, so the running jobs are those
 * places: each queued job before this one takes the place that frees up first, and so does this one.
 */
function etaSeconds(
  job: AnalysisJob,
  before: readonly AnalysisJob[],
  { durations, now }: JobQueue
): number | null {
  const own = durations.estimate(job.pageCount);
  if (own === null) return null;
  const time = now();
  const left = (running: AnalysisJob, estimate: number) =>
    Math.max(0, estimate - (time - (running.startedAt ?? time)));
  if (job.status === 'processing') return Math.ceil(left(job, own) / 1000);

  /** When each place of the worker frees up, in ms from now. */
  const places: number[] = [];
  const waiting: number[] = [];
  for (const other of before) {
    const estimate = durations.estimate(other.pageCount) ?? 0;
    if (other.status === 'processing') places.push(left(other, estimate));
    else waiting.push(estimate);
  }
  if (places.length === 0) places.push(0);
  for (const estimate of waiting) places[soonest(places)] += estimate;
  return Math.ceil((places[soonest(places)] + own) / 1000);
}

function soonest(places: readonly number[]): number {
  let index = 0;
  for (let i = 1; i < places.length; i++) if (places[i] < places[index]) index = i;
  return index;
}
