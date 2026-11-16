import type { ApiErrorBody, ApiErrorCode } from '@/shared/analysis/contract';

import { redactError } from '../logs/server-log';

/** HTTP status of every error code (SPEC §7.2). */
const STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  job_not_found: 404,
  too_large: 413,
  encrypted_pdf: 422,
  invalid_pdf: 422,
  upgrade_required: 426,
  rate_limited: 429,
  too_many_jobs: 429,
  analysis_failed: 502,
  unavailable: 503,
};

/** The JSON error body of SPEC §7.2. `message` is for developers; the app shows text by `code`. */
function errorResponse(code: ApiErrorCode, message: string, headers?: HeadersInit) {
  const body: ApiErrorBody = { error: { code, message } };
  return Response.json(body, { status: STATUS[code], headers });
}

/** Thrown while a request is checked; the handler turns it into `errorResponse()`. */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly headers?: HeadersInit
  ) {
    super(message);
    this.name = 'ApiFailure';
  }

  get status() {
    return STATUS[this.code];
  }

  toResponse() {
    return errorResponse(this.code, this.message, this.headers);
  }
}

/**
 * Runs a route handler: a failed check becomes its SPEC §7.2 body, and anything else is rethrown
 * without its message (`redactError()`), which could quote the request (SPEC §7.1).
 */
export async function handleApiFailures(handle: () => Promise<Response>): Promise<Response> {
  try {
    return await handle();
  } catch (error) {
    if (error instanceof ApiFailure) return error.toResponse();
    throw redactError(error);
  }
}
