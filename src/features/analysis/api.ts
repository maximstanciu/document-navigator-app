import { randomUUID } from 'expo-crypto';
import { getCalendars, getLocales } from 'expo-localization';

import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/features/reminders/notifications';
import { ApiError, apiClient } from '@/lib/api/client';
import { getRepositories } from '@/lib/db/repositories';
import type { DocumentMimeType, DocumentRecord } from '@/lib/db/types';
import { pageFileExists, pageFileUri } from '@/lib/files/page-files';
import { currentLanguage } from '@/lib/i18n/i18n';
import { isOnline } from '@/lib/network';
import {
  ANALYZE_FIELDS,
  analysisJobStateSchema,
  apiErrorBodySchema,
  type AnalysisJobState,
} from '@/shared/analysis/contract';
import { localCalendarDate } from '@/shared/calendar-date';
import type { ExplanationLocale } from '@/shared/explanation-locales';
import type { MemoCountry } from '@/shared/legal-memo-countries';
import { ACTIVE_JOBS_PER_DEVICE } from '@/shared/limits';
import { limitsResponseSchema, type LimitsResponse } from '@/shared/limits-contract';
import type { UiLocale } from '@/shared/ui-locales';

import { analysisRecords } from './analysis-records';
import { memoCountryFor, type DocumentCountryChoice } from './document-country';
import { AnalysisError, toAnalysisError } from './errors';
import { keepScreenAwake } from './keep-awake';
import { pushTokenIfAllowed } from './push-token';
import { appendUploadFile, type UploadFile } from './upload-file';

/**
 * Data access for the analysis feature, no React: the analysis jobs on the server (SPEC §7.2) and
 * the document's way through `analyzing` to `ready` or `failed` (SPEC §6.3). `./queries.ts` wraps it.
 *
 * An analysis runs in two stages (ANL-3, D-1): the upload (`PUT`) creates a job on the server, and
 * the app then asks about it (`GET`) until it ends, saves the result and deletes the job (`DELETE`).
 * With notifications allowed, the job has the push token (in the upload, or later by `PATCH`), and
 * the server sends a push when it ends (ANL-12).
 */

const JOBS_PATH = '/api/v1/analyses';
const LIMITS_PATH = '/api/v1/limits';

/** The upload gives up after 5 minutes without an answer (`timeout`, SPEC §7.2). */
export const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000;

/** How often the app asks about its jobs while it is in the foreground (SPEC §7.2 «Опрос»). */
export const POLL_INTERVAL_MS = 10_000;

/** A question about a job or its deletion: a server that doesn't answer it is asked again later. */
const JOB_REQUEST_TIMEOUT_MS = 30_000;

const jobPath = (jobId: string) => `${JOBS_PATH}/${encodeURIComponent(jobId)}`;

export type UploadRequest = {
  files: readonly UploadFile[];
  locale: ExplanationLocale;
  /** The device's date, `YYYY-MM-DD`, and IANA time zone, for relative deadlines (ANL-5). */
  today: string;
  timezone: string;
  /** The interface language, for the push about the finished job (ANL-12). */
  uiLocale: UiLocale;
  /** The Expo push token for that push, if notifications are allowed (ANL-12). */
  pushToken: string | null;
  /** Whose legal memo the analysis starts with (ANL-14); `null` for none. */
  country: MemoCountry | null;
};

/** A state the shared schema rejects counts as `analysis_failed` (SPEC §7.2). */
function parseJobState(body: unknown): AnalysisJobState {
  const parsed = analysisJobStateSchema.safeParse(body);
  if (!parsed.success) throw new AnalysisError('analysis_failed');
  return parsed.data;
}

/**
 * Uploads the pages as the job `jobId` (`PUT /api/v1/analyses/{jobId}`) and returns its state.
 * A repeated upload under the same id gets the job the first one created (ANL-9). Fails as
 * `apiClient` does (`ApiError`, `ApiTimeoutError`, a network `TypeError`, an abort), or with
 * `analysis_failed` when the state isn't what the contract says.
 */
export async function uploadDocument(
  jobId: string,
  request: UploadRequest,
  signal?: AbortSignal
): Promise<AnalysisJobState> {
  const form = new FormData();
  for (const file of request.files) await appendUploadFile(form, ANALYZE_FIELDS.files, file);
  form.append(ANALYZE_FIELDS.locale, request.locale);
  form.append(ANALYZE_FIELDS.today, request.today);
  form.append(ANALYZE_FIELDS.timezone, request.timezone);
  form.append(ANALYZE_FIELDS.uiLocale, request.uiLocale);
  if (request.pushToken) form.append(ANALYZE_FIELDS.pushToken, request.pushToken);
  if (request.country) form.append(ANALYZE_FIELDS.country, request.country);

  const body = await apiClient.put<unknown>(jobPath(jobId), {
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
    signal,
  });
  return parseJobState(body);
}

/** The state of a job (`GET /api/v1/analyses/{jobId}`). Fails like `uploadDocument()`. */
export async function fetchJobState(jobId: string): Promise<AnalysisJobState> {
  const body = await apiClient.get<unknown>(jobPath(jobId), { timeoutMs: JOB_REQUEST_TIMEOUT_MS });
  return parseJobState(body);
}

/**
 * Gives a job the token for the push about its end (`PATCH`, ANL-12): `204`, or `404 job_not_found`
 * for a job that is gone. Fails like `uploadDocument()`.
 */
export async function sendPushToken(jobId: string, pushToken: string): Promise<void> {
  await apiClient.patch<unknown>(jobPath(jobId), {
    body: { pushToken },
    timeoutMs: JOB_REQUEST_TIMEOUT_MS,
  });
}

/** Deletes a job on the server (`DELETE`): `204` even for one it doesn't know (SPEC §7.2). */
export async function deleteJob(jobId: string): Promise<void> {
  await apiClient.delete<unknown>(jobPath(jobId), { timeoutMs: JOB_REQUEST_TIMEOUT_MS });
}

/**
 * What is left of the device's daily limit (`GET /api/v1/limits`, SET-4). Fails as `apiClient` does,
 * or with a zod error when the body isn't what the contract says.
 */
export async function fetchLimits(): Promise<LimitsResponse> {
  return limitsResponseSchema.parse(await apiClient.get<unknown>(LIMITS_PATH));
}

/** The page files in order, under neutral names. Pages missing on the device fail the analysis (STO-8). */
async function filesToUpload(
  documentId: string,
  mimeType: DocumentMimeType
): Promise<UploadFile[]> {
  const pages = await getRepositories().pages.listByDocument(documentId);
  if (pages.length === 0) throw new AnalysisError('files_missing');
  const files: UploadFile[] = [];
  for (const page of pages) {
    if (!(await pageFileExists(page.relativePath))) throw new AnalysisError('files_missing');
    files.push({
      uri: pageFileUri(page.relativePath),
      name: mimeType === 'application/pdf' ? 'document.pdf' : `page-${page.index + 1}.jpg`,
      type: mimeType,
    });
  }
  return files;
}

/** «Explanation language» from settings, by default the interface language (D-5, SET-1). */
async function explanationLocale(): Promise<ExplanationLocale> {
  const { explanationLocale } = await getRepositories().settings.get();
  return explanationLocale ?? currentLanguage();
}

/**
 * The country for the legal memo (ANL-14): the one picked for this analysis (DET-9), else
 * «Country of documents» (SET-6), by default the phone's region.
 */
async function memoCountry(picked: DocumentCountryChoice | undefined): Promise<MemoCountry | null> {
  const choice = picked ?? (await getRepositories().settings.get()).documentCountry;
  return memoCountryFor(choice, getLocales()[0]?.regionCode ?? null);
}

function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/**
 * «Try again» after an upload that broke off or got no answer uploads under the same job: if the
 * first upload got through after all, the server answers with that job, and no second analysis
 * starts (ANL-9). Any other start gets a new job.
 */
function jobIdToStart(document: DocumentRecord): string {
  const brokeOff = document.errorCode === 'network' || document.errorCode === 'timeout';
  return document.status === 'failed' && brokeOff && document.analysisJobId
    ? document.analysisJobId
    : randomUUID();
}

type Upload = { controller: AbortController; ended: Promise<void> };

/**
 * Uploads running in this run of the app, by document. Their jobs aren't asked about until the
 * upload ends: the server doesn't know them yet. After a restart the map is empty, and the job of
 * an upload that broke off is asked about like any other (ANL-4).
 */
const uploads = new Map<string, Upload>();

/** Runs `work` after the previous call has finished: one check of the jobs at a time. */
function serialQueue() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(work: () => Promise<T>): Promise<T> => {
    const run = last.then(work, work);
    last = run.catch(() => undefined);
    return run;
  };
}

const oneCheckAtATime = serialQueue();
const oneDeletionRunAtATime = serialQueue();

/**
 * Analyzes a draft or a failed document, or a ready one again (ANL-1, ANL-3, ANL-8, SPEC §6.3).
 * The document becomes `analyzing` under a job (then `onStarted` runs, so screens can show it), and
 * its pages are uploaded with the screen kept on (D-1). This resolves once the server has the job:
 * its result comes later, through `checkAnalysisJobs()`. A rejected or broken upload fails the
 * document with the reason, which is also thrown as an `AnalysisError`. Without a network nothing
 * is sent and the document fails as `offline`, its pages kept (ANL-10); with three documents
 * already analyzing, as `too_many_jobs` (ANL-3, SPEC §8.3). The upload asks for the legal memo of
 * `country`, picked for this analysis (DET-9), or of «Country of documents» (ANL-14, SET-6).
 *
 * Throws a plain `Error` without touching the document when it's gone or already being analyzed.
 * Cancelling (`cancelAnalysis()`) or deleting the document aborts the upload.
 */
export async function analyzeDocument(
  documentId: string,
  onStarted?: () => unknown,
  country?: DocumentCountryChoice
): Promise<void> {
  const { documents } = getRepositories();
  const document = await documents.get(documentId);
  if (!document || uploads.has(documentId)) {
    throw new Error(`Document ${documentId} can't be analyzed now`);
  }
  const job = { jobId: jobIdToStart(document), locale: await explanationLocale() };

  // Registered before the document turns `analyzing`, so no check asks about the job too early.
  const controller = new AbortController();
  let ended!: () => void;
  uploads.set(documentId, { controller, ended: new Promise((resolve) => (ended = resolve)) });
  const release = keepScreenAwake(`analysis-${documentId}`);
  let state: AnalysisJobState;
  try {
    if (!(await documents.startAnalysis(documentId, job))) {
      throw new Error(`Document ${documentId} can't be analyzed now`);
    }
    await onStarted?.();
    try {
      if (!(await isOnline())) throw new AnalysisError('offline');
      const others = (await documents.listAnalyzing()).filter(({ id }) => id !== documentId);
      if (others.length >= ACTIVE_JOBS_PER_DEVICE) throw new AnalysisError('too_many_jobs');
      const [files, pushToken, memo] = await Promise.all([
        filesToUpload(documentId, document.mimeType),
        pushTokenIfAllowed(),
        memoCountry(country),
      ]);
      state = await uploadDocument(
        job.jobId,
        {
          files,
          locale: job.locale,
          today: localCalendarDate(new Date()),
          timezone: deviceTimeZone(),
          uiLocale: currentLanguage(),
          pushToken,
          country: memo,
        },
        controller.signal
      );
    } catch (error) {
      const failure = toAnalysisError(error);
      // A state the app can't read is a job it can't use: the server may drop it.
      const removeJob = failure.code === 'analysis_failed';
      await documents.failAnalysis(documentId, { jobId: job.jobId, code: failure.code, removeJob });
      throw failure;
    }
  } finally {
    release();
    uploads.delete(documentId);
    ended();
  }
  // A repeated upload may find its job already finished.
  await applyJobState({ id: documentId, jobId: job.jobId }, state);
}

/** Aborts the upload of a document, if one is running, and waits until it has given up. */
async function stopUpload(documentId: string): Promise<void> {
  const upload = uploads.get(documentId);
  if (!upload) return;
  upload.controller.abort();
  await upload.ended;
}

/**
 * «Cancel the analysis» (ANL-13), during the upload or while the job waits: the document goes back
 * to `draft`, or to `ready` with its previous result, and the job is deleted on the server. Doesn't
 * wait for the server: without a network the deletion is sent again later (SPEC §6.2), and the
 * result of a cancelled job is never stored. `false` if the document wasn't being analyzed.
 */
export async function cancelAnalysis(documentId: string): Promise<boolean> {
  const { documents } = getRepositories();
  const document = await documents.get(documentId);
  if (document?.status !== 'analyzing' || !document.analysisJobId) return false;
  const cancelled = await documents.cancelAnalysis(documentId, document.analysisJobId);
  // An upload that is cut off creates no job; one that got through is deleted after it.
  await stopUpload(documentId);
  sendJobDeletionsInBackground();
  return cancelled;
}

/**
 * For a document being deleted (STO-6): stops its upload, then sends the deletion of its job, which
 * `documents.remove()` has queued. Doesn't wait for the server.
 */
export async function forgetDocumentAnalysis(documentId: string): Promise<void> {
  await stopUpload(documentId);
  sendJobDeletionsInBackground();
}

/**
 * For «Delete all data» (STO-7), before the database is wiped: stops every upload and sends
 * `DELETE` for every unfinished job and every job waiting to be deleted, without waiting for the
 * server. What isn't deleted the server removes when it expires.
 */
export async function deleteAllAnalysisJobs(): Promise<void> {
  const { documents, analysisJobDeletions } = getRepositories();
  await Promise.all([...uploads.keys()].map(stopUpload));
  const jobIds = new Set([
    ...(await documents.listAnalyzing()).map(({ jobId }) => jobId),
    ...(await analysisJobDeletions.list()),
  ]);
  for (const jobId of jobIds) void deleteJob(jobId).catch(() => undefined);
}

/** A `4xx` other than `429` won't change by asking again: the request itself is refused. */
function isRefused(error: unknown): error is ApiError {
  return (
    error instanceof ApiError && error.status >= 400 && error.status < 500 && error.status !== 429
  );
}

/**
 * Sends `DELETE` for every job waiting to be deleted (SPEC §6.2) and forgets the ones the server
 * answered. A job the server refuses to delete (e.g. `426`) is forgotten too: it expires there by
 * itself. The rest stay for the next run, at startup or on return to the foreground.
 */
export function sendJobDeletions(): Promise<void> {
  return oneDeletionRunAtATime(async () => {
    const { analysisJobDeletions } = getRepositories();
    for (const jobId of await analysisJobDeletions.list()) {
      try {
        await deleteJob(jobId);
      } catch (error) {
        if (!isRefused(error)) continue;
      }
      await analysisJobDeletions.remove(jobId);
    }
  });
}

export function sendJobDeletionsInBackground(): void {
  void sendJobDeletions().catch(() => undefined);
}

/**
 * Gives every job that hasn't ended the push token (`PATCH`, ANL-12): `token` when the push service
 * has just changed it, otherwise the current one if notifications are allowed. Jobs still uploading
 * are left out: the server doesn't know them yet, and their upload carries the token. A job the
 * server couldn't be told about is told the next time: at the next start, return to the foreground
 * or change of the token. Asks for no permission (REM-5).
 */
export async function sendPushTokenToJobs(token?: string): Promise<void> {
  const jobs = (await getRepositories().documents.listAnalyzing()).filter(
    ({ id }) => !uploads.has(id)
  );
  if (jobs.length === 0) return;
  const pushToken = token ?? (await pushTokenIfAllowed());
  if (!pushToken) return;
  await Promise.all(
    jobs.map(({ jobId }) => sendPushToken(jobId, pushToken).catch(() => undefined))
  );
}

export function sendPushTokenToJobsInBackground(token?: string): void {
  void sendPushTokenToJobs(token).catch(() => undefined);
}

/**
 * «Notify me when ready» while a job waits (ANL-12, REM-5): asks for the permission when the OS
 * still lets it, and with it gives every waiting job the push token. Returns the permission; when
 * it isn't granted, the panel explains how to allow notifications.
 */
export async function turnOnAnalysisPush(): Promise<NotificationPermission> {
  const current = await getNotificationPermission();
  const permission = current === 'granted' ? current : await requestNotificationPermission();
  if (permission === 'granted') await sendPushTokenToJobs();
  return permission;
}

/** Where a job that hasn't ended stands, for the status panel (ANL-3). */
export type JobProgress = { status: 'queued'; ahead: number } | { status: 'processing' };

/**
 * One check of the jobs. `progress` has an entry for every document whose job hasn't ended, by
 * document id; `null` when the server couldn't be asked this time. `changed` tells that a document
 * was finished, so local data must be read again.
 */
export type AnalysisJobsCheck = {
  progress: Record<string, JobProgress | null>;
  changed: boolean;
};

/**
 * Applies a job's state to its document (SPEC §7.2 «Опрос»): `done` is stored (merged by ANL-8 on
 * a re-analysis) with the job queued for deletion in the same transaction, `failed` keeps the
 * reason and drops the job too. Returns the progress of a job that hasn't ended, or `'ended'`.
 */
async function applyJobState(
  job: { id: string; jobId: string },
  state: AnalysisJobState
): Promise<JobProgress | 'ended'> {
  const { documents } = getRepositories();
  switch (state.status) {
    case 'queued':
      return { status: 'queued', ahead: state.ahead };
    case 'processing':
      return { status: 'processing' };
    case 'done':
      try {
        await documents.saveAnalysis(job.id, {
          jobId: job.jobId,
          analysis: state.analysis,
          pageCount: state.pageCount,
          legalMemoCountry: state.legalMemo?.country ?? null,
          ...analysisRecords(job.id, state.analysis, randomUUID),
        });
      } catch {
        // The result couldn't be stored: let the person try again instead of waiting forever.
        await documents.failAnalysis(job.id, { ...job, code: 'interrupted', removeJob: true });
      }
      return 'ended';
    case 'failed':
      await documents.failAnalysis(job.id, { ...job, code: state.error.code, removeJob: true });
      return 'ended';
  }
}

/** Asks the server about one job; `null` when it can't answer now, which ends nothing (ANL-10). */
async function checkJob(job: { id: string; jobId: string }): Promise<JobProgress | 'ended' | null> {
  const { documents } = getRepositories();
  let state: AnalysisJobState;
  try {
    state = await fetchJobState(job.jobId);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      // No such job: the upload never got through, the server restarted, or 24 hours passed (ANL-4).
      const body = apiErrorBodySchema.safeParse(error.body);
      if (!body.success || body.data.error.code === 'job_not_found') {
        await documents.failAnalysis(job.id, { ...job, code: 'interrupted' });
        return 'ended';
      }
    }
    if (error instanceof AnalysisError || isRefused(error)) {
      const failure = toAnalysisError(error);
      await documents.failAnalysis(job.id, { ...job, code: failure.code, removeJob: true });
      return 'ended';
    }
    // No network, a timeout, a 5xx or a 429: the job goes on, and is asked about again.
    return null;
  }
  return applyJobState(job, state);
}

/**
 * Asks the server about the job of every document being analyzed, except those still uploading,
 * and applies what it says (SPEC §7.2 «Опрос»): a finished job is stored or fails the document,
 * one the server doesn't know fails it as `interrupted` (ANL-4). Then sends the queued deletions.
 * One check runs at a time.
 */
export function checkAnalysisJobs(): Promise<AnalysisJobsCheck> {
  return oneCheckAtATime(async () => {
    const progress: AnalysisJobsCheck['progress'] = {};
    let changed = false;
    for (const job of await getRepositories().documents.listAnalyzing()) {
      if (uploads.has(job.id)) continue;
      const outcome = await checkJob(job);
      if (outcome === 'ended') changed = true;
      else progress[job.id] = outcome;
    }
    await sendJobDeletions().catch(() => undefined);
    return { progress, changed };
  });
}
