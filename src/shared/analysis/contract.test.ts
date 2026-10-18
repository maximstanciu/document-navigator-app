import {
  ANALYZE_ERROR_CODES,
  analyzeResponseSchema,
  apiErrorBodySchema,
  isAnalyzeErrorCode,
} from './contract';
import { ANALYSIS_FIXTURES } from './fixtures';

const { invoice } = ANALYSIS_FIXTURES;

describe('analyzeResponseSchema', () => {
  it('accepts the analysis with the page count the server counted', () => {
    const body = { analysis: invoice, pageCount: 2 };
    expect(analyzeResponseSchema.parse(body)).toEqual(body);
  });

  it.each([
    ['no page count', { analysis: invoice }],
    ['a page count of zero', { analysis: invoice, pageCount: 0 }],
    ['an analysis that fails the schema', { analysis: { ...invoice, title: 1 }, pageCount: 1 }],
  ])('rejects %s', (_case, body) => {
    expect(analyzeResponseSchema.safeParse(body).success).toBe(false);
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
      'analysis_failed',
      'unavailable',
    ]);
    expect(isAnalyzeErrorCode('too_large')).toBe(true);
    expect(isAnalyzeErrorCode('timeout')).toBe(false);
  });

  it('reads an error body even with a code this client does not know', () => {
    const body = { error: { code: 'new_code', message: 'Something new' } };
    expect(apiErrorBodySchema.parse(body)).toEqual(body);
    expect(apiErrorBodySchema.safeParse({ message: 'Not an error body' }).success).toBe(false);
  });
});
