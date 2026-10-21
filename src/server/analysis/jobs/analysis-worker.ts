import type { AnalyzeResponse } from '@/shared/analysis/contract';

import type { AnalysisUsage } from '../../limits/analysis-usage';
import type { JobEndCode } from '../../limits/usage-keys';
import { redactError, reportError, type ServerLog } from '../../logs/server-log';
import { finalizeAnalysis } from '../finalize-analysis';
import { LlmProviderError, type LlmProvider } from '../llm-provider';
import {
  analysisEndEvent,
  NO_MODEL_FACTS,
  type AnalysisJob,
  type JobResult,
  type ModelFacts,
} from './analysis-job';
import type { AnalysisJobStore } from './job-store';

export type AnalysisWorkerOptions = {
  store: AnalysisJobStore;
  provider: LlmProvider;
  usage: AnalysisUsage;
  log: ServerLog;
  now: () => number;
  /** Jobs analyzed at once (`ANALYSIS_CONCURRENCY`): 1 for a model on a CPU, which answers one by one. */
  concurrency: number;
};

type Ending = { code: JobEndCode; result: JobResult; error: string | null };

/**
 * Runs the queued jobs in the order they came, `concurrency` at a time (SPEC §7.1): hands the files
 * to the model, checks and post-processes its answer (SPEC §7.4) and records the result in the
 * store. Each job logs `analysis.start` and `analysis.end`. A job removed while the model works is
 * cancelled: its model call is aborted (`AbortSignal`) and its result, if any, dropped (ANL-13).
 */
export class AnalysisWorker {
  private readonly running = new Set<Promise<void>>();

  constructor(private readonly options: AnalysisWorkerOptions) {}

  /** Starts queued jobs while there is room, and returns: the jobs run in the background. */
  kick(): void {
    while (this.running.size < this.options.concurrency) {
      const job = this.options.store.start();
      if (!job) return;
      const run: Promise<void> = this.run(job).finally(() => {
        this.running.delete(run);
        this.kick();
      });
      this.running.add(run);
    }
  }

  /** Resolves once no job is running and none waits to start. */
  async idle(): Promise<void> {
    while (this.running.size > 0) await Promise.all(this.running);
  }

  /** Never rejects: nobody awaits a job, and an unhandled rejection would stop the server. */
  private async run(job: AnalysisJob): Promise<void> {
    try {
      await this.analyze(job);
    } catch (error) {
      reportError(error);
    }
  }

  private async analyze(job: AnalysisJob) {
    const { store, provider, usage, log, now } = this.options;
    const startedAt = job.startedAt ?? now();
    log({ event: 'analysis.start', job: job.job, waitMs: startedAt - job.queuedAt });

    const facts: ModelFacts = { ...NO_MODEL_FACTS };
    let ending: Ending;
    try {
      const response = await this.callModel(job, facts);
      ending = { code: 'ok', result: { status: 'done', response }, error: null };
    } catch (error) {
      ending = endingOf(error, job.controller.signal);
    }
    // Removed while the model worked: the app cancelled the analysis (ANL-13).
    if (!store.finish(job, ending.result)) ending = { ...ending, code: 'cancelled', error: null };

    log(
      analysisEndEvent(job, {
        code: ending.code,
        ms: now() - startedAt,
        provider: provider.id,
        error: ending.error,
        facts,
      })
    );
    await usage.jobEnded(job.usage, {
      code: ending.code,
      costUsd: facts.costUsd,
      hasDeadline: ending.code === 'ok' && (facts.deadlines ?? 0) > 0,
    });
  }

  /**
   * Hands the files over to the model: the job lets go of them first, so once the provider has
   * encoded and dropped them, nothing holds them in memory (SPEC §7.1).
   */
  private async callModel(job: AnalysisJob, facts: ModelFacts): Promise<AnalyzeResponse> {
    const { provider, now } = this.options;
    const input = job.input;
    if (!input) throw new Error('A started job has no files.');
    job.input = null;
    const { signal } = job.controller;
    const context = { today: input.today, pageCount: job.pageCount };

    const modelStartedAt = now();
    let output;
    try {
      output = await provider.analyze({
        files: input.files.splice(0),
        locale: input.locale,
        today: input.today,
        timezone: input.timezone,
        signal,
        checkShape: (result) => {
          const checked = finalizeAnalysis(result, context);
          return checked.ok ? null : checked.error;
        },
      });
    } catch (error) {
      if (signal.aborted || error instanceof LlmProviderError) throw error;
      throw new LlmProviderError('unavailable', 'The analysis service is unavailable.');
    } finally {
      facts.modelMs = now() - modelStartedAt;
    }
    facts.inputTokens = output.usage.inputTokens;
    facts.outputTokens = output.usage.outputTokens;
    facts.costUsd = output.costUsd;

    // The provider has already asked once more with the error (`checkShape`, SPEC §7.4).
    const finalized = finalizeAnalysis(output.result, context);
    if (!finalized.ok) {
      throw new LlmProviderError('analysis_failed', 'The model returned an invalid analysis.');
    }
    const { analysis } = finalized;
    facts.deadlines = analysis.deadlines.length;
    facts.fraudSignals = analysis.fraudSignals.length;
    facts.readable = analysis.quality.readable;
    return { analysis, pageCount: job.pageCount };
  }
}

/**
 * A failed job tells the app `analysis_failed` or `unavailable` (SPEC §7.2). A PDF only the
 * renderer couldn't read is the model's failure here: the server checked the file before the queue.
 * Anything else is a bug: `internal` in the log, `unavailable` for the app, as a crash would be.
 */
function endingOf(error: unknown, signal: AbortSignal): Ending {
  // The job was removed, so this result goes nowhere.
  if (signal.aborted) {
    return { code: 'cancelled', result: { status: 'failed', code: 'unavailable' }, error: null };
  }
  if (error instanceof LlmProviderError) {
    const code = error.code === 'unavailable' ? 'unavailable' : 'analysis_failed';
    return { code, result: { status: 'failed', code }, error: null };
  }
  reportError(error);
  return {
    code: 'internal',
    result: { status: 'failed', code: 'unavailable' },
    error: redactError(error).name,
  };
}
