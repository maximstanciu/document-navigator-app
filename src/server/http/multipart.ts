import { ApiFailure } from './api-failure';
import { limitedBody } from './limited-body';

// The global FormData and File types in this project are React Native's (spike 0.2), so server code
// describes the parts of a parsed body it uses itself.

/** A file part of a parsed multipart body. */
export type FormFile = {
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ParsedForm = {
  get(name: string): unknown;
  getAll(name: string): unknown[];
  delete(name: string): void;
};

export function isFormFile(value: unknown): value is FormFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FormFile).arrayBuffer === 'function' &&
    typeof (value as FormFile).size === 'number' &&
    typeof (value as FormFile).type === 'string'
  );
}

/**
 * Parses a `multipart/form-data` body, reading at most `maxBytes` of it: a declared
 * `Content-Length` over the limit is refused before reading, and a body without one stops at the
 * limit, so an oversized upload never fills the isolate's memory (SPEC §7.1).
 */
export async function readMultipartForm(request: Request, maxBytes: number): Promise<ParsedForm> {
  const contentType = request.headers.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) {
    throw new ApiFailure('invalid_request', 'Expected a multipart/form-data body.');
  }
  if (Number(request.headers.get('Content-Length') ?? 0) > maxBytes) {
    throw tooLarge(maxBytes);
  }
  if (!request.body) {
    throw new ApiFailure('invalid_request', 'The request has no body.');
  }

  const { stream, exceeded } = limitedBody(request.body, maxBytes);
  try {
    const response = new Response(stream, { headers: { 'Content-Type': contentType } });
    return (await response.formData()) as unknown as ParsedForm;
  } catch {
    if (exceeded()) throw tooLarge(maxBytes);
    throw new ApiFailure('invalid_request', 'The multipart body could not be parsed.');
  }
}

function tooLarge(maxBytes: number) {
  return new ApiFailure('too_large', `The request body is larger than ${maxBytes} bytes.`);
}
