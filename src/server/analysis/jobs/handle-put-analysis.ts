import type { AnalysisJobState, ApiErrorCode } from '@/shared/analysis/contract';

import { ApiFailure } from '../../http/api-failure';
import { readClientIp } from '../../http/client-ip';
import type { UsageSession } from '../../limits/analysis-usage';
import { isUploadEndCode, type UploadEndCode } from '../../limits/usage-keys';
import { redactError } from '../../logs/server-log';
import { hashClientIp, hashJobId } from '../../privacy/pseudonyms';
import { countPages, readAnalyzeUpload } from '../read-analyze-upload';
import { createAnalysisJob, jobState, type AnalysisJob } from './analysis-job';
import type { AnalysisJobDeps } from './job-deps';
import { readJobRequest } from './job-request';

/** What a full queue tells the app to wait (SPEC §7.2). */
const QUEUE_FULL_RETRY_AFTER_SECONDS = 60;

/**
 * What `upload.end` reports besides the outcome: metadata only, never content (SPEC §7.1). Filled
 * in as the upload gets further; `null` where it didn't get that far.
 */
type UploadFacts = {
  job: string | null;
  kind: 'pdf' | 'images' | null;
  pages: number | null;
  bytes: number | null;
  locale: string | null;
  push: boolean | null;
  ahead: number | null;
  /** Set once the limits are checked; the end of the upload is counted against it. */
  usage: UsageSession | null;
};

/**
 * `PUT /api/v1/analyses/{jobId}` (SPEC §7.2): checks the client, the limits and the upload, and
 * queues the job without waiting for the model: `202` with the job's state.
 *
 * In the order of SPEC §7.2: the app version (426), the other headers and the job id (400); a job
 * the device has under this id already answers with its state, unread (ANL-9); then the limits
 * (429), the budget and the queue (503), and only then the body (400, 413, 422).
 *
 * Logs `upload.start` once the headers check out and `upload.end` with the outcome. If the client
 * hangs up, there is no end: an interrupted upload (SPEC §8.7).
 */
export async function handlePutAnalysis(
  request: Request,
  jobId: unknown,
  deps: AnalysisJobDeps
): Promise<Response> {
  const startedAt = deps.now();
  // The server makes its own: an id a client sends would let it pick what the logs show.
  const requestId = crypto.randomUUID();
  const facts: UploadFacts = {
    job: null,
    kind: null,
    pages: null,
    bytes: null,
    locale: null,
    push: null,
    ahead: null,
    usage: null,
  };
  const end = async (
    status: number,
    code: UploadEndCode | ApiErrorCode,
    error: string | null = null
  ) => {
    const { usage, ...logged } = facts;
    deps.log({
      event: 'upload.end',
      requestId,
      status,
      code,
      error,
      ms: deps.now() - startedAt,
      ...logged,
    });
    // An upload counts once its limits are checked: from there on every code is an upload's.
    if (usage && isUploadEndCode(code)) await deps.usage.uploadEnded(usage, code);
  };

  try {
    const { state, code } = await upload(request, jobId, deps, requestId, facts);
    facts.ahead = state.status === 'queued' ? state.ahead : null;
    await end(202, code);
    return Response.json(state, { status: 202 });
  } catch (error) {
    // The client is gone. No end event.
    if (request.signal.aborted) throw error;
    if (error instanceof ApiFailure) {
      await end(error.status, error.code);
      return error.toResponse();
    }
    const redacted = redactError(error);
    await end(500, 'internal', redacted.name);
    throw redacted;
  }
}

async function upload(
  request: Request,
  jobIdParam: unknown,
  deps: AnalysisJobDeps,
  requestId: string,
  facts: UploadFacts
): Promise<{ state: AnalysisJobState; code: 'accepted' | 'existing' }> {
  const { client, jobId, device } = await readJobRequest(request, jobIdParam, deps);
  facts.job = await hashJobId(jobId, deps.deviceHashKey);
  const declaredBytes = Number(request.headers.get('Content-Length'));
  deps.log({
    event: 'upload.start',
    requestId,
    device,
    job: facts.job,
    platform: client.platform,
    appVersion: client.appVersion.join('.'),
    bodyBytes: Number.isFinite(declaredBytes) && declaredBytes > 0 ? declaredBytes : null,
  });

  // A repeated upload (ANL-9): the first one got through, so this one isn't read.
  const existing = deps.jobs.get(device, jobId);
  if (existing) return { state: stateOf(existing, deps), code: 'existing' };

  const ip = await hashClientIp(readClientIp(request.headers), deps.deviceHashKey);
  const { session, counts } = await deps.usage.begin({
    requestId,
    device,
    ip,
    platform: client.platform,
  });
  facts.usage = session;
  // Nothing awaits from the checks to the reservation, so no other upload slips in between.
  const rejection = deps.usage.rejection(counts, deps.jobs.unfinished(device)) ?? queueFull(deps);
  if (rejection) throw rejection;
  const reservation = deps.jobs.reserve(device);

  try {
    const upload = await readAnalyzeUpload(request);
    facts.kind = upload.kind;
    facts.bytes = upload.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
    facts.locale = upload.locale;
    facts.push = upload.pushToken !== null;
    const pageCount = await countPages(upload);
    facts.pages = pageCount;

    reservation.release();
    // The same upload twice at once: the one read first made the job.
    const raced = deps.jobs.get(device, jobId);
    if (raced) return { state: stateOf(raced, deps), code: 'existing' };

    const { files, locale, today, timezone, uiLocale, pushToken } = upload;
    const job = createAnalysisJob({
      device,
      jobId,
      job: facts.job,
      usage: session,
      kind: upload.kind,
      pageCount,
      locale,
      uiLocale,
      pushToken,
      queuedAt: deps.now(),
      input: { files, locale, today, timezone },
    });
    deps.jobs.add(job);
    deps.worker.kick();
    return { state: stateOf(job, deps), code: 'accepted' };
  } finally {
    reservation.release();
  }
}

function stateOf(job: AnalysisJob, deps: AnalysisJobDeps) {
  return jobState(job, () => deps.jobs.ahead(job));
}

function queueFull(deps: AnalysisJobDeps): ApiFailure | null {
  if (deps.jobs.queued() < deps.queueMax) return null;
  return new ApiFailure('unavailable', 'The analysis queue is full.', {
    'Retry-After': String(QUEUE_FULL_RETRY_AFTER_SECONDS),
  });
}
