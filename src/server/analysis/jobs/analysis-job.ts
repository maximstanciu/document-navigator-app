import type {
  AnalysisJobState,
  AnalyzeResponse,
  JOB_FAILURE_CODES,
} from '@/shared/analysis/contract';
import type { ExplanationLocale } from '@/shared/explanation-locales';
import type { MemoCountry } from '@/shared/legal-memo-countries';
import type { UiLocale } from '@/shared/ui-locales';

import type { AnalysisUsage, UsageSession } from '../../limits/analysis-usage';
import type { JobEndCode } from '../../limits/usage-keys';
import { reportError, type LogEvent, type ServerLog } from '../../logs/server-log';
import type { LlmFile } from '../llm-provider';

export type JobStatus = AnalysisJobState['status'];

export type JobFailureCode = (typeof JOB_FAILURE_CODES)[number];

/** How a job ended: the analysis, or why there is none (SPEC §7.2). */
export type JobResult =
  { status: 'done'; response: AnalyzeResponse } | { status: 'failed'; code: JobFailureCode };

/** What the model needs from the upload. The job keeps it only until the model call starts. */
export type JobInput = {
  files: LlmFile[];
  locale: ExplanationLocale;
  today: string;
  timezone: string;
  /** The memo the app asked for (ANL-14). */
  country: MemoCountry | null;
};

/**
 * An analysis job (SPEC §7.1) as the job store keeps it in memory. The store moves it through its
 * states; handlers only set `pushToken` and `fetched`.
 */
export type AnalysisJob = {
  /** Pseudonym of the device that uploaded it: with `jobId`, the job's key. */
  readonly device: string;
  /** As the app made it, lower case. For the push about the job (ANL-12); never logged. */
  readonly jobId: string;
  /** Pseudonym of `jobId`: the job in logs. */
  readonly job: string;
  /** The upload that created the job; its counters count the job's end too. */
  readonly usage: UsageSession;
  readonly kind: 'pdf' | 'images';
  readonly pageCount: number;
  readonly locale: ExplanationLocale;
  /** The interface language, for the push (ANL-12). */
  readonly uiLocale: UiLocale;
  /** Never logged (SPEC §8.2). */
  pushToken: string | null;
  /** The files until the model gets them, then `null`. */
  input: JobInput | null;
  status: JobStatus;
  result: JobResult | null;
  readonly queuedAt: number;
  startedAt: number | null;
  endedAt: number | null;
  /** The app has seen how the job ended: the first GET of a done job charges the device (SPEC §8.3). */
  fetched: boolean;
  /** Stops the model call when the job is cancelled (ANL-13). */
  readonly controller: AbortController;
};

export type NewAnalysisJob = Pick<
  AnalysisJob,
  | 'device'
  | 'jobId'
  | 'job'
  | 'usage'
  | 'kind'
  | 'pageCount'
  | 'locale'
  | 'uiLocale'
  | 'pushToken'
  | 'queuedAt'
> & { input: JobInput };

export function createAnalysisJob(job: NewAnalysisJob): AnalysisJob {
  return {
    ...job,
    status: 'queued',
    result: null,
    startedAt: null,
    endedAt: null,
    fetched: false,
    controller: new AbortController(),
  };
}

const FAILURE_MESSAGES: Record<JobFailureCode, string> = {
  analysis_failed: 'The model returned an invalid analysis.',
  unavailable: 'The analysis service is unavailable.',
};

/** What GET and PUT answer about a job (SPEC §7.2). `ahead` comes from the store's queue. */
export function jobState(job: AnalysisJob, ahead: () => number): AnalysisJobState {
  const { result } = job;
  if (result?.status === 'done') return { status: 'done', ...result.response };
  if (result?.status === 'failed') {
    return {
      status: 'failed',
      error: { code: result.code, message: FAILURE_MESSAGES[result.code] },
    };
  }
  return job.status === 'processing'
    ? { status: 'processing' }
    : { status: 'queued', ahead: ahead() };
}

/** What the model call told about itself and its answer: metadata only (SPEC §7.1). */
export type ModelFacts = {
  modelMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  deadlines: number | null;
  fraudSignals: number | null;
  readable: boolean | null;
  /** The memo the analysis ended with (ANL-14), from a closed list. */
  memo: MemoCountry | null;
  /** Analyzed again with the memo of the country the model found (ANL-14). */
  memoRetried: boolean | null;
};

export const NO_MODEL_FACTS: ModelFacts = {
  modelMs: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
  deadlines: null,
  fraudSignals: null,
  readable: null,
  memo: null,
  memoRetried: null,
};

/**
 * The `analysis.end` event (SPEC §7.1): one per accepted job, a job cancelled in the queue
 * included, so accepted uploads without one are the jobs a restart lost (SPEC §8.7).
 */
export function analysisEndEvent(
  job: AnalysisJob,
  end: {
    code: JobEndCode;
    /** From the start of the analysis; `null` for a job that never started. */
    ms: number | null;
    provider: string | null;
    /** The error's name for `internal`, never its message. */
    error?: string | null;
    facts?: ModelFacts;
  }
): LogEvent {
  return {
    event: 'analysis.end',
    job: job.job,
    code: end.code,
    error: end.error ?? null,
    ms: end.ms,
    kind: job.kind,
    pages: job.pageCount,
    locale: job.locale,
    provider: end.provider,
    ...(end.facts ?? NO_MODEL_FACTS),
  };
}

/**
 * What happens to a finished job nobody removed in time: `job.removed`, and a result nobody fetched
 * counts as lost for the beta (SPEC §8.7). For `MemoryAnalysisJobStore`'s `onExpired`.
 */
export function onJobExpired({ log, usage }: { log: ServerLog; usage: AnalysisUsage }) {
  return (job: AnalysisJob) => {
    log({ event: 'job.removed', job: job.job, reason: 'expired', state: job.status });
    if (job.status === 'done' && !job.fetched) usage.expired(job.usage).catch(reportError);
  };
}
