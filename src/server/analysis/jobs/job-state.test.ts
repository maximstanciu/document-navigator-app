/** @jest-environment node */
import { createAnalysisJob, type AnalysisJob } from './analysis-job';
import { JobDurations, seedPageMs } from './job-durations';
import { jobState, type JobQueue } from './job-state';

const NOW = Date.parse('2026-10-18T12:00:00Z');
const MINUTE = 60_000;

/** A job of `pageCount` pages, running for `runningMs` or queued. */
function job(pageCount: number, runningMs?: number): AnalysisJob {
  const created = createAnalysisJob({
    device: 'd1',
    jobId: crypto.randomUUID(),
    job: 'job',
    usage: { requestId: 'r', device: 'd1', ip: 'ip', platform: 'android', day: '2026-10-18' },
    kind: 'images',
    pageCount,
    locale: 'ru',
    uiLocale: 'ru',
    pushToken: null,
    queuedAt: NOW - MINUTE,
    input: { files: [], locale: 'ru', today: '2026-10-18', timezone: 'UTC', country: null },
  });
  if (runningMs !== undefined) {
    created.status = 'processing';
    created.startedAt = NOW - runningMs;
  }
  return created;
}

/** One page takes 2 minutes, and the fixed part as much: a one-page job 4, a three-page job 8. */
function queue(before: AnalysisJob[], durations = new JobDurations(seedPageMs(240))): JobQueue {
  return { jobs: { before: () => before }, durations, now: () => NOW };
}

describe('jobState', () => {
  it('tells a running job what is left of its estimate', () => {
    expect(jobState(job(1, MINUTE), queue([]))).toEqual({
      status: 'processing',
      etaSeconds: 180,
      elapsedSeconds: 60,
    });
    expect(jobState(job(3, 0), queue([]))).toEqual({
      status: 'processing',
      etaSeconds: 480,
      elapsedSeconds: 60,
    });
  });

  it('says 0 once a job runs longer than estimated', () => {
    expect(jobState(job(1, 10 * MINUTE), queue([]))).toEqual({
      status: 'processing',
      etaSeconds: 0,
      elapsedSeconds: 60,
    });
  });

  it('adds the jobs ahead to the wait of a queued one', () => {
    const running = job(1, MINUTE);
    const waiting = job(3);

    // 3 minutes left of the running job, 8 for the one queued earlier, 4 for this one.
    expect(jobState(job(1), queue([running, waiting]))).toEqual({
      status: 'queued',
      ahead: 2,
      etaSeconds: 15 * 60,
      elapsedSeconds: 60,
    });
  });

  it('counts a running job past its estimate as ending now', () => {
    expect(jobState(job(1), queue([job(1, 30 * MINUTE)]))).toMatchObject({ etaSeconds: 4 * 60 });
  });

  it('spreads the queue over the jobs analyzed at once (ANALYSIS_CONCURRENCY)', () => {
    // Two places: free in 1 and 3 minutes. The two queued jobs take 4 minutes each: the first
    // one the place free in 1 (until 5), the second the one free in 3 (until 7); this one starts at
    // 5 and takes 4.
    const before = [job(1, 3 * MINUTE), job(1, MINUTE), job(1), job(1)];
    expect(jobState(job(1), queue(before))).toMatchObject({ ahead: 4, etaSeconds: 9 * 60 });
  });

  it('tells how long the job has been on the server, the wait in the queue included', () => {
    const waited = { ...job(1, MINUTE), queuedAt: NOW - 5 * MINUTE - 900 };
    expect(jobState(waited, queue([]))).toEqual({
      status: 'processing',
      etaSeconds: 180,
      elapsedSeconds: 5 * 60,
    });
    expect(jobState({ ...job(1), queuedAt: NOW }, queue([]))).toMatchObject({ elapsedSeconds: 0 });
  });

  it('has no estimate while the server has nothing to go by', () => {
    const unknown = new JobDurations();
    expect(jobState(job(1, MINUTE), queue([], unknown))).toEqual({
      status: 'processing',
      etaSeconds: null,
      elapsedSeconds: 60,
    });
    expect(jobState(job(1), queue([job(1, 0)], unknown))).toEqual({
      status: 'queued',
      ahead: 1,
      etaSeconds: null,
      elapsedSeconds: 60,
    });
  });

  it('answers a finished job with its result, without an estimate', () => {
    const failed = job(1, MINUTE);
    failed.status = 'failed';
    failed.result = { status: 'failed', code: 'unavailable' };

    expect(jobState(failed, queue([]))).toEqual({
      status: 'failed',
      error: { code: 'unavailable', message: 'The analysis service is unavailable.' },
    });
  });
});
