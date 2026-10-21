import type { AnalysisJob, JobResult } from './analysis-job';

/** A place in the queue held while an upload is read: released when the job is added or refused. */
export type JobReservation = { release(): void };

/**
 * The analysis jobs of all devices: the queue and the results (SPEC §7.1). A job belongs to a
 * device: it is found by the device's pseudonym together with its id. A finished job is kept until
 * it is removed or its results expire; a queued one has no time limit.
 */
export interface AnalysisJobStore {
  /** The device's job, or `undefined`: never uploaded, removed or expired. */
  get(device: string, jobId: string): AnalysisJob | undefined;
  /** Adds a queued job at the end of the queue. */
  add(job: AnalysisJob): void;
  /** Takes the job out, wherever it is, and drops its files; `undefined` if there was none. */
  remove(device: string, jobId: string): AnalysisJob | undefined;
  /** Marks the oldest queued job `processing` and returns it, or `undefined` if none waits. */
  start(): AnalysisJob | undefined;
  /** Records how a started job ended. `false` if the job was removed meanwhile (cancelled). */
  finish(job: AnalysisJob, result: JobResult): boolean;
  /** Jobs that will be analyzed before this queued one: those queued earlier and the running ones. */
  ahead(job: AnalysisJob): number;
  /** Jobs waiting in the queue, uploads holding a place in it included. */
  queued(): number;
  /**
   * The device's unfinished jobs (SPEC §8.3): queued, running, or done with a result it hasn't
   * fetched, and its uploads holding a place.
   */
  unfinished(device: string): number;
  /** Holds a place in the queue and among the device's unfinished jobs while its upload is read. */
  reserve(device: string): JobReservation;
}

export type MemoryAnalysisJobStoreOptions = {
  now: () => number;
  /** How long a finished job is kept after its end (`ANALYSIS_RESULT_TTL_HOURS`). */
  resultTtlMs: number;
  /** A finished job was removed because nobody removed it in time. */
  onExpired: (job: AnalysisJob) => void;
};

/** Longest wait of the expiry timer, so a long retention never overflows a timer. */
const MAX_SWEEP_DELAY_MS = 60 * 60 * 1000;

/**
 * The jobs in this process's memory: documents and results never touch a disk or Redis, and a
 * restart loses them (SPEC §7.1). Expired results go at the latest when their time comes, by a
 * timer that doesn't keep the process alive, and before any read.
 */
export class MemoryAnalysisJobStore implements AnalysisJobStore {
  /** In the order of arrival, which is the order of the queue. */
  private readonly jobs = new Map<string, AnalysisJob>();
  private readonly reservedBy = new Map<string, number>();
  private reserved = 0;
  private sweepTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: MemoryAnalysisJobStoreOptions) {}

  get(device: string, jobId: string) {
    this.sweep();
    return this.jobs.get(keyOf(device, jobId));
  }

  add(job: AnalysisJob) {
    this.sweep();
    const key = keyOf(job.device, job.jobId);
    if (this.jobs.has(key)) throw new Error('The device has a job with this id already.');
    this.jobs.set(key, job);
  }

  remove(device: string, jobId: string) {
    this.sweep();
    const key = keyOf(device, jobId);
    const job = this.jobs.get(key);
    if (!job) return undefined;
    this.jobs.delete(key);
    job.input = null;
    return job;
  }

  start() {
    this.sweep();
    for (const job of this.jobs.values()) {
      if (job.status !== 'queued') continue;
      job.status = 'processing';
      job.startedAt = this.options.now();
      return job;
    }
    return undefined;
  }

  finish(job: AnalysisJob, result: JobResult) {
    if (this.jobs.get(keyOf(job.device, job.jobId)) !== job) return false;
    job.status = result.status;
    job.result = result;
    job.endedAt = this.options.now();
    job.input = null;
    this.scheduleSweep();
    return true;
  }

  ahead(job: AnalysisJob) {
    this.sweep();
    let ahead = 0;
    let before = true;
    for (const other of this.jobs.values()) {
      if (other === job) before = false;
      else if (other.status === 'processing' || (before && other.status === 'queued')) ahead++;
    }
    return ahead;
  }

  queued() {
    this.sweep();
    let queued = this.reserved;
    for (const job of this.jobs.values()) if (job.status === 'queued') queued++;
    return queued;
  }

  unfinished(device: string) {
    this.sweep();
    let unfinished = this.reservedBy.get(device) ?? 0;
    for (const job of this.jobs.values()) {
      if (job.device !== device) continue;
      if (job.status === 'queued' || job.status === 'processing') unfinished++;
      else if (job.status === 'done' && !job.fetched) unfinished++;
    }
    return unfinished;
  }

  reserve(device: string): JobReservation {
    this.reserved++;
    this.reservedBy.set(device, (this.reservedBy.get(device) ?? 0) + 1);
    let held = true;
    return {
      release: () => {
        if (!held) return;
        held = false;
        this.reserved--;
        const left = this.reservedBy.get(device)! - 1;
        if (left > 0) this.reservedBy.set(device, left);
        else this.reservedBy.delete(device);
      },
    };
  }

  /** Removes the finished jobs whose time is up. */
  private sweep() {
    const now = this.options.now();
    for (const [key, job] of this.jobs) {
      if (job.endedAt === null || now - job.endedAt < this.options.resultTtlMs) continue;
      this.jobs.delete(key);
      this.options.onExpired(job);
    }
  }

  /** Wakes up when the oldest finished job expires, so it goes even if no request comes. */
  private scheduleSweep() {
    if (this.sweepTimer !== null) return;
    let next = Infinity;
    for (const job of this.jobs.values()) {
      if (job.endedAt !== null) next = Math.min(next, job.endedAt + this.options.resultTtlMs);
    }
    if (next === Infinity) return;
    const delay = Math.min(Math.max(0, next - this.options.now()), MAX_SWEEP_DELAY_MS);
    this.sweepTimer = setTimeout(() => {
      this.sweepTimer = null;
      this.sweep();
      this.scheduleSweep();
    }, delay);
    // On Node: the timer alone doesn't keep the process running.
    (this.sweepTimer as { unref?: () => void }).unref?.();
  }
}

function keyOf(device: string, jobId: string) {
  return `${device}:${jobId}`;
}
