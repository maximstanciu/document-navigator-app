import { z } from 'zod';

import { COUNTRY_CODE } from '../legal-memo-countries';
import { isUuidV4 } from '../uuid';
import { analysisResultSchema } from './schema';

// Contract of the analysis jobs, PUT/GET/PATCH/DELETE /api/v1/analyses/{jobId} (SPEC §7.2), beyond
// the analysis itself.

/** Fields of the PUT `multipart/form-data` body. `files` repeats, one entry per page. */
export const ANALYZE_FIELDS = {
  files: 'files',
  locale: 'locale',
  today: 'today',
  timezone: 'timezone',
  /** The interface language, for the push about the finished job (ANL-12). */
  uiLocale: 'uiLocale',
  /** Optional: an Expo push token, when notifications are allowed (ANL-12). */
  pushToken: 'pushToken',
  /** Optional: the country whose legal memo to start with, ISO 3166-1 alpha-2 (ANL-14). */
  country: 'country',
} as const;

/** What a document is uploaded as: one PDF as it is, or pages the app made JPEG (CAP-4, D-4). */
export const PDF_MIME_TYPE = 'application/pdf';
export const IMAGE_MIME_TYPE = 'image/jpeg';

export type UploadMimeType = typeof PDF_MIME_TYPE | typeof IMAGE_MIME_TYPE;

/**
 * The `{jobId}` of the path: a UUID v4 the app makes and keeps on the document before the upload,
 * so a repeated upload finds the job the first one created (ANL-9).
 */
export function isAnalysisJobId(value: unknown): value is string {
  return isUuidV4(value);
}

const PUSH_TOKEN = /^Expo(?:nent)?PushToken\[[\w-]{1,200}\]$/;

/** An Expo push token, `ExponentPushToken[…]` (ANL-12). */
export function isPushToken(value: unknown): value is string {
  return typeof value === 'string' && PUSH_TOKEN.test(value);
}

/** PATCH body: the push token for a job uploaded without one, or a new token (ANL-12). */
export const analysisJobPatchSchema = z.object({ pushToken: z.string().refine(isPushToken) });

export type AnalysisJobPatch = z.infer<typeof analysisJobPatchSchema>;

/**
 * The analysis of a done job. `pageCount` is what the server counted: pages of a PDF, or the
 * number of images. `legalMemo` is the memo the analysis was made with (ANL-14), `null` for none;
 * a server older than SPEC v0.40 doesn't send it. Metadata wraps the analysis so it stays out of
 * the model's JSON Schema.
 */
export const analyzeResponseSchema = z.object({
  analysis: analysisResultSchema,
  pageCount: z.number().int().min(1),
  legalMemo: z
    .object({ country: z.string().regex(COUNTRY_CODE), version: z.string() })
    .nullable()
    .default(null),
});

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

/** Why a job failed: the model's answer was unusable, or the model was unreachable (SPEC §7.2). */
export const JOB_FAILURE_CODES = ['analysis_failed', 'unavailable'] as const;

/**
 * State of a job, the `200` of GET and the `202` of PUT (SPEC §7.2). `ahead` counts the jobs that
 * will be analyzed before this one, the running ones included.
 */
export const analysisJobStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('queued'), ahead: z.number().int().min(0) }),
  z.object({ status: z.literal('processing') }),
  analyzeResponseSchema.extend({ status: z.literal('done') }),
  z.object({
    status: z.literal('failed'),
    error: z.object({ code: z.enum(JOB_FAILURE_CODES), message: z.string() }),
  }),
]);

export type AnalysisJobState = z.infer<typeof analysisJobStateSchema>;

/**
 * Codes an analysis can fail with on the server's side (SPEC §7.2): an upload the server refused,
 * or a job that failed. The app keeps them on the document (SPEC §6.1).
 */
export const ANALYZE_ERROR_CODES = [
  'invalid_request',
  'too_large',
  'encrypted_pdf',
  'invalid_pdf',
  'upgrade_required',
  'rate_limited',
  'too_many_jobs',
  'analysis_failed',
  'unavailable',
] as const;

export type AnalyzeErrorCode = (typeof ANALYZE_ERROR_CODES)[number];

export function isAnalyzeErrorCode(value: unknown): value is AnalyzeErrorCode {
  return ANALYZE_ERROR_CODES.includes(value as AnalyzeErrorCode);
}

/**
 * Every error code of the API routes: the analysis codes and `job_not_found`, which the app turns
 * into `interrupted` rather than keeping it (ANL-4).
 */
export const API_ERROR_CODES = [...ANALYZE_ERROR_CODES, 'job_not_found'] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/**
 * Error body of every API route. `code` stays a plain string so a client can still read the body
 * when a newer server sends a code it doesn't know.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
