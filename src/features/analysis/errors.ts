import { ApiError, ApiTimeoutError } from '@/lib/api/client';
import type { ClientErrorCode } from '@/lib/db/types';
import {
  apiErrorBodySchema,
  isAnalyzeErrorCode,
  type AnalyzeErrorCode,
} from '@/shared/analysis/contract';

/**
 * Why an analysis failed: a server code (SPEC §7.2) or one the client records itself. Every error of
 * an analysis becomes one of these here, in one place (SPEC §7.2), and screens show its text (ANL-9).
 */
export type AnalysisErrorCode = AnalyzeErrorCode | ClientErrorCode;

export class AnalysisError extends Error {
  constructor(
    readonly code: AnalysisErrorCode,
    /** When a `429` or `503` says the analysis may be tried again (`Retry-After`). */
    readonly retryAt: Date | null = null
  ) {
    super(`Analysis failed: ${code}`);
    this.name = 'AnalysisError';
  }
}

/** For a response without a SPEC §7.2 body, e.g. from a proxy. Any other `5xx` is `unavailable`. */
const CODE_BY_STATUS: Partial<Record<number, AnalyzeErrorCode>> = {
  400: 'invalid_request',
  413: 'too_large',
  422: 'invalid_pdf',
  426: 'upgrade_required',
  429: 'rate_limited',
};

function codeOf(error: ApiError): AnalyzeErrorCode {
  const body = apiErrorBodySchema.safeParse(error.body);
  if (body.success && isAnalyzeErrorCode(body.data.error.code)) return body.data.error.code;
  // EAS Hosting answers a crashed isolate (500) or the CPU limit (504) without our body.
  return (error.status < 500 && CODE_BY_STATUS[error.status]) || 'unavailable';
}

/** `Retry-After` in seconds (what our server sends) or as an HTTP date. */
function retryAtOf(header: string | null, now: Date): Date | null {
  if (!header) return null;
  if (/^\d+$/.test(header.trim())) return new Date(now.getTime() + Number(header) * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? null : new Date(date);
}

export function toAnalysisError(error: unknown, now = new Date()): AnalysisError {
  if (error instanceof AnalysisError) return error;
  if (error instanceof ApiTimeoutError) return new AnalysisError('timeout');
  if (error instanceof ApiError) {
    return new AnalysisError(codeOf(error), retryAtOf(error.headers.get('Retry-After'), now));
  }
  // fetch rejects with a TypeError when the request breaks off (the app went to the background) or
  // never reaches the server; anything else that stops the request counts the same.
  return new AnalysisError('network');
}

/**
 * Whether «Try again» can help (ANL-9: network, limits and server). A file the server rejected or
 * pages missing on the device fail the same way every time.
 */
export function isRetryable(code: AnalysisErrorCode): boolean {
  switch (code) {
    case 'invalid_request':
    case 'too_large':
    case 'encrypted_pdf':
    case 'invalid_pdf':
    case 'files_missing':
      return false;
    default:
      return true;
  }
}
