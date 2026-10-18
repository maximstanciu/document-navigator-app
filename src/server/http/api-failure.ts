import type { AnalyzeErrorCode, ApiErrorBody } from '@/shared/analysis/contract';

/** HTTP status of every error code (SPEC §7.2). */
const STATUS: Record<AnalyzeErrorCode, number> = {
  invalid_request: 400,
  too_large: 413,
  encrypted_pdf: 422,
  invalid_pdf: 422,
  upgrade_required: 426,
  rate_limited: 429,
  analysis_failed: 502,
  unavailable: 503,
};

/** The JSON error body of SPEC §7.2. `message` is for developers; the app shows text by `code`. */
export function errorResponse(code: AnalyzeErrorCode, message: string, headers?: HeadersInit) {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status: STATUS[code], headers });
}

/** Thrown while a request is checked; the handler turns it into `errorResponse()`. */
export class ApiFailure extends Error {
  constructor(
    readonly code: AnalyzeErrorCode,
    message: string,
    readonly headers?: HeadersInit
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  toResponse() {
    return errorResponse(this.code, this.message, this.headers);
  }
}
