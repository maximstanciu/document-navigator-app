import { analysisJobPatchSchema } from '@/shared/analysis/contract';

import { ApiFailure } from '../../http/api-failure';
import { readJsonBody } from '../../http/json-body';
import { redactError } from '../../logs/server-log';
import type { ServerDeps } from '../../server-deps';
import { analysisEndEvent, jobState, type AnalysisJob } from './analysis-job';
import { readJobRequest } from './job-request';

/** A push token and some room: the PATCH body is never bigger. */
const MAX_PATCH_BYTES = 4 * 1024;

/**
 * `GET /api/v1/analyses/{jobId}` (SPEC §7.2): the job's state, `404 job_not_found` if the device
 * has no such job. The first `done` the app gets charges its daily limit (SPEC §8.3) and logs
 * `analysis.delivered`; asking again returns the same result for free.
 */
export function handleGetAnalysis(request: Request, jobId: unknown, deps: ServerDeps) {
  return answer(async () => {
    const { device, jobId: id } = await readJobRequest(request, jobId, deps);
    const job = findJob(deps, device, id);
    const state = jobState(job, () => deps.jobs.ahead(job));
    if (job.endedAt !== null && !job.fetched) {
      job.fetched = true;
      if (job.status === 'done') {
        deps.log({
          event: 'analysis.delivered',
          job: job.job,
          device,
          sinceEndMs: deps.now() - job.endedAt,
        });
        await deps.usage.delivered(job.usage);
      }
    }
    return Response.json(state);
  });
}

/**
 * `PATCH /api/v1/analyses/{jobId}` with `{ pushToken }` (SPEC §7.2): the token for the push about
 * the job, given after the upload or changed since (ANL-12). `204`, or `404 job_not_found`.
 */
export function handlePatchAnalysis(request: Request, jobId: unknown, deps: ServerDeps) {
  return answer(async () => {
    const { device, jobId: id } = await readJobRequest(request, jobId, deps);
    const body = analysisJobPatchSchema.safeParse(await readJsonBody(request, MAX_PATCH_BYTES));
    if (!body.success) {
      throw new ApiFailure('invalid_request', 'pushToken must be an Expo push token.');
    }
    findJob(deps, device, id).pushToken = body.data.pushToken;
    return new Response(null, { status: 204 });
  });
}

/**
 * `DELETE /api/v1/analyses/{jobId}` (SPEC §7.2): the app saved the result, cancelled the analysis
 * (ANL-13) or deleted the document (STO-6). The job leaves the queue, its model call is aborted,
 * its result and push token are gone. `204` for an unknown job too, so a repeat is safe.
 */
export function handleDeleteAnalysis(request: Request, jobId: unknown, deps: ServerDeps) {
  return answer(async () => {
    const { device, jobId: id } = await readJobRequest(request, jobId, deps);
    const job = deps.jobs.remove(device, id);
    if (job) await removed(job, deps);
    return new Response(null, { status: 204 });
  });
}

async function removed(job: AnalysisJob, deps: ServerDeps) {
  const reason = job.endedAt !== null && job.fetched ? 'ack' : 'cancelled';
  deps.log({ event: 'job.removed', job: job.job, reason, state: job.status });
  job.pushToken = null;
  if (job.status === 'processing') {
    // The worker logs the job's end once the model call stops.
    job.controller.abort();
  } else if (job.status === 'queued') {
    deps.log(analysisEndEvent(job, { code: 'cancelled', ms: null, provider: null }));
    await deps.usage.jobEnded(job.usage, { code: 'cancelled', costUsd: null, hasDeadline: false });
  }
}

function findJob(deps: ServerDeps, device: string, jobId: string): AnalysisJob {
  const job = deps.jobs.get(device, jobId);
  if (!job) throw new ApiFailure('job_not_found', 'This device has no job with this id.');
  return job;
}

/** Turns a failed check into its SPEC §7.2 body; anything else is rethrown without its message. */
async function answer(handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    if (error instanceof ApiFailure) return error.toResponse();
    throw redactError(error);
  }
}
