/** @jest-environment node */
import { ApiFailure, handleApiFailures } from './api-failure';

describe('handleApiFailures', () => {
  it('returns what the handler answers', async () => {
    const response = await handleApiFailures(async () => new Response(null, { status: 204 }));

    expect(response.status).toBe(204);
  });

  it('turns a failed check into its error body, status and headers', async () => {
    const response = await handleApiFailures(async () => {
      throw new ApiFailure('rate_limited', 'Too many.', { 'Retry-After': '60' });
    });

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    await expect(response.json()).resolves.toEqual({
      error: { code: 'rate_limited', message: 'Too many.' },
    });
  });

  it('rethrows anything else without its message, which could quote the request', async () => {
    const failure = handleApiFailures(async () => {
      throw new SyntaxError('Unexpected token in "Invoice 42 from ACME"');
    });

    await expect(failure).rejects.toMatchObject({
      name: 'SyntaxError',
      message: '[message redacted]',
    });
  });
});
