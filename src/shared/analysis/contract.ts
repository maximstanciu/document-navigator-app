import { z } from 'zod';

import { analysisResultSchema } from './schema';

// Contract of POST /api/v1/analyze (SPEC §7.2) beyond the analysis itself.

/** Fields of the `multipart/form-data` request. `files` repeats, one entry per page. */
export const ANALYZE_FIELDS = {
  files: 'files',
  locale: 'locale',
  today: 'today',
  timezone: 'timezone',
} as const;

/** What a document is uploaded as: one PDF as it is, or pages the app made JPEG (CAP-4, D-4). */
export const PDF_MIME_TYPE = 'application/pdf';
export const IMAGE_MIME_TYPE = 'image/jpeg';

export type UploadMimeType = typeof PDF_MIME_TYPE | typeof IMAGE_MIME_TYPE;

/**
 * `200` body. `pageCount` is what the server counted: pages of a PDF, or the number of images.
 * Metadata wraps the analysis so it stays out of the model's JSON Schema.
 */
export const analyzeResponseSchema = z.object({
  analysis: analysisResultSchema,
  pageCount: z.number().int().min(1),
});

export type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;

/** Server error codes (SPEC §7.2). */
export const ANALYZE_ERROR_CODES = [
  'invalid_request',
  'too_large',
  'encrypted_pdf',
  'invalid_pdf',
  'upgrade_required',
  'rate_limited',
  'analysis_failed',
  'unavailable',
] as const;

export type AnalyzeErrorCode = (typeof ANALYZE_ERROR_CODES)[number];

export function isAnalyzeErrorCode(value: unknown): value is AnalyzeErrorCode {
  return ANALYZE_ERROR_CODES.includes(value as AnalyzeErrorCode);
}

/**
 * Error body of every API route. `code` stays a plain string so a client can still read the body
 * when a newer server sends a code it doesn't know.
 */
export const apiErrorBodySchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});

export type ApiErrorBody = z.infer<typeof apiErrorBodySchema>;
