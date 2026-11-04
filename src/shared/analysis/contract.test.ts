import {
  analysisJobPatchSchema,
  analysisJobStateSchema,
  ANALYZE_ERROR_CODES,
  analyzeResponseSchema,
  API_ERROR_CODES,
  apiErrorBodySchema,
  isAnalysisJobId,
  isAnalyzeErrorCode,
  isPushToken,
} from './contract';
import { ANALYSIS_FIXTURES } from './fixtures';

const { invoice } = ANALYSIS_FIXTURES;

describe('analyzeResponseSchema', () => {
  it('accepts the analysis with the page count the server counted and the memo it used', () => {
    const body = {
      analysis: invoice,
      pageCount: 2,
      legalMemo: { country: 'DE', version: '2026-10-20' },
    };
    expect(analyzeResponseSchema.parse(body)).toEqual(body);
  });

  it('reads an answer of a server older than the memo field as made without a memo (ANL-14)', () => {
    expect(analyzeResponseSchema.parse({ analysis: invoice, pageCount: 2 }).legalMemo).toBeNull();
  });

  it('accepts an analysis stored before SPEC v0.40, without the document’s country', () => {
    const { documentCountry: _country, ...older } = invoice;
    expect(analyzeResponseSchema.safeParse({ analysis: older, pageCount: 2 }).success).toBe(true);
  });

  it.each([
    ['no page count', { analysis: invoice }],
    [
      'a memo country that isn’t a code',
      { analysis: invoice, pageCount: 1, legalMemo: { country: 'Portugal', version: '1' } },
    ],
    [
      'a document country in lower case',
      { analysis: { ...invoice, documentCountry: 'pt' }, pageCount: 1 },
    ],
    ['a page count of zero', { analysis: invoice, pageCount: 0 }],
    ['an analysis that fails the schema', { analysis: { ...invoice, title: 1 }, pageCount: 1 }],
  ])('rejects %s', (_case, body) => {
    expect(analyzeResponseSchema.safeParse(body).success).toBe(false);
  });
});

describe('analysisJobStateSchema', () => {
  it.each([
    ['queued', { status: 'queued', ahead: 2 }],
    ['processing', { status: 'processing' }],
    ['done', { status: 'done', analysis: invoice, pageCount: 2, legalMemo: null }],
    ['failed', { status: 'failed', error: { code: 'unavailable', message: 'Down.' } }],
  ])('accepts a %s job', (_status, state) => {
    expect(analysisJobStateSchema.parse(state)).toEqual(state);
  });

  it.each([
    ['an unknown status', { status: 'lost' }],
    ['a queued job without its place', { status: 'queued' }],
    ['a negative place', { status: 'queued', ahead: -1 }],
    ['a done job without the page count', { status: 'done', analysis: invoice }],
    ['a done job with a broken analysis', { status: 'done', analysis: { title: 1 }, pageCount: 1 }],
    [
      'a failure with an upload code',
      { status: 'failed', error: { code: 'too_large', message: '' } },
    ],
  ])('rejects %s', (_case, state) => {
    expect(analysisJobStateSchema.safeParse(state).success).toBe(false);
  });
});

describe('job ids and push tokens', () => {
  it('takes a UUID v4 as a job id', () => {
    expect(isAnalysisJobId('3d0f6c1e-8a2b-4c5d-9e6f-7a8b9c0d1e2f')).toBe(true);
    expect(isAnalysisJobId('3D0F6C1E-8A2B-4C5D-9E6F-7A8B9C0D1E2F')).toBe(true);
    expect(isAnalysisJobId('3d0f6c1e-8a2b-1c5d-9e6f-7a8b9c0d1e2f')).toBe(false);
    expect(isAnalysisJobId('job-1')).toBe(false);
    expect(isAnalysisJobId(undefined)).toBe(false);
  });

  it('takes an Expo push token, in the PATCH body too', () => {
    expect(isPushToken('ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]')).toBe(true);
    expect(isPushToken('ExpoPushToken[a-b_c]')).toBe(true);
    expect(isPushToken('ExponentPushToken[]')).toBe(false);
    expect(isPushToken('ExponentPushToken[x] ')).toBe(false);
    expect(isPushToken(`ExponentPushToken[${'x'.repeat(201)}]`)).toBe(false);
    expect(isPushToken('fcm-token')).toBe(false);

    const body = { pushToken: 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]' };
    expect(analysisJobPatchSchema.parse(body)).toEqual(body);
    expect(analysisJobPatchSchema.safeParse({ pushToken: 'x' }).success).toBe(false);
  });
});

describe('API errors', () => {
  it('lists the error codes of SPEC §7.2', () => {
    expect(ANALYZE_ERROR_CODES).toEqual([
      'invalid_request',
      'too_large',
      'encrypted_pdf',
      'invalid_pdf',
      'upgrade_required',
      'rate_limited',
      'too_many_jobs',
      'analysis_failed',
      'unavailable',
    ]);
    expect(API_ERROR_CODES).toEqual([...ANALYZE_ERROR_CODES, 'job_not_found']);
    expect(isAnalyzeErrorCode('too_many_jobs')).toBe(true);
    expect(isAnalyzeErrorCode('job_not_found')).toBe(false);
    expect(isAnalyzeErrorCode('timeout')).toBe(false);
  });

  it('reads an error body even with a code this client does not know', () => {
    const body = { error: { code: 'new_code', message: 'Something new' } };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
    expect(apiErrorBodySchema.safeParse({ message: 'Not an error body' }).success).toBe(false);
  });
});
