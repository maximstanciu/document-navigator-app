import { ApiError, ApiTimeoutError } from '@/lib/api/client';

import { AnalysisError, isRetryable, toAnalysisError } from './errors';

const NOW = new Date('2026-10-18T21:30:00Z');

function apiError(status: number, body?: unknown, headers?: Record<string, string>) {
  return new ApiError(`POST failed with ${status}`, status, body, new Headers(headers));
}

const errorBody = (code: string) => ({ error: { code, message: 'Server text' } });

describe('toAnalysisError (SPEC §7.2)', () => {
  it.each([
    ['invalid_request', 400],
    ['too_large', 413],
    ['encrypted_pdf', 422],
    ['invalid_pdf', 422],
    ['upgrade_required', 426],
    ['rate_limited', 429],
    ['analysis_failed', 502],
    ['unavailable', 503],
  ])('takes %s from the error body', (code, status) => {
    expect(toAnalysisError(apiError(status, errorBody(code)), NOW).code).toBe(code);
  });

  it.each([
    [400, 'invalid_request'],
    [413, 'too_large'],
    [422, 'invalid_pdf'],
    [426, 'upgrade_required'],
    [429, 'rate_limited'],
    [404, 'unavailable'],
  ])('reads a %s without our body (a proxy) by its status as %s', (status, code) => {
    expect(toAnalysisError(apiError(status, '<html>Error</html>'), NOW).code).toBe(code);
  });

  it.each([500, 502, 504])(
    'reads a %s without our body (crashed isolate, CPU limit) as unavailable',
    (status) => {
      expect(toAnalysisError(apiError(status, 'Internal Server Error'), NOW).code).toBe(
        'unavailable'
      );
    }
  );

  it('falls back to the status when a newer server sends a code this app does not know', () => {
    expect(toAnalysisError(apiError(429, errorBody('slow_down')), NOW).code).toBe('rate_limited');
  });

  it('reads Retry-After in seconds as the moment the analysis can be tried again', () => {
    const error = toAnalysisError(
      apiError(429, errorBody('rate_limited'), { 'Retry-After': '9000' }),
      NOW
    );

    expect(error.retryAt).toEqual(new Date('2026-10-19T00:00:00Z'));
  });

  it('also reads Retry-After as an HTTP date, and ignores one it can not read', () => {
    const asDate = apiError(503, errorBody('unavailable'), {
      'Retry-After': 'Mon, 19 Oct 2026 00:00:00 GMT',
    });
    const unreadable = apiError(429, errorBody('rate_limited'), { 'Retry-After': 'soon' });

    expect(toAnalysisError(asDate, NOW).retryAt).toEqual(new Date('2026-10-19T00:00:00Z'));
    expect(toAnalysisError(unreadable, NOW).retryAt).toBeNull();
    expect(toAnalysisError(apiError(429, errorBody('rate_limited')), NOW).retryAt).toBeNull();
  });

  it('reads a timeout as timeout and a broken request as network', () => {
    expect(toAnalysisError(new ApiTimeoutError('no answer'), NOW).code).toBe('timeout');
    expect(toAnalysisError(new TypeError('Network request failed'), NOW).code).toBe('network');
    expect(toAnalysisError(new DOMException('Aborted', 'AbortError'), NOW).code).toBe('network');
  });

  it('passes an AnalysisError through as it is', () => {
    const offline = new AnalysisError('offline');

    expect(toAnalysisError(offline, NOW)).toBe(offline);
  });
});

describe('isRetryable (ANL-9)', () => {
  it.each([
    'offline',
    'network',
    'timeout',
    'interrupted',
    'rate_limited',
    'unavailable',
    'analysis_failed',
    'upgrade_required',
  ] as const)('offers «Try again» for %s', (code) => {
    expect(isRetryable(code)).toBe(true);
  });

  it.each([
    'invalid_request',
    'too_large',
    'encrypted_pdf',
    'invalid_pdf',
    'files_missing',
  ] as const)('does not for %s, which would fail the same way again', (code) => {
    expect(isRetryable(code)).toBe(false);
  });
});
