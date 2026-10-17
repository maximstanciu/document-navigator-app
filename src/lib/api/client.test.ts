import { ApiError, apiClient, buildUrl, setAccessTokenGetter } from './client';

jest.mock('@/lib/env', () => ({ env: { apiUrl: 'https://api.example.com/' } }));

function mockFetchResponse(status: number, body?: unknown) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(text || null, { status }) as Response);
}

afterEach(() => {
  jest.restoreAllMocks();
  setAccessTokenGetter(undefined);
});

describe('buildUrl', () => {
  it('joins base and path without doubling slashes', () => {
    expect(buildUrl('/documents', undefined, 'https://api.example.com/')).toBe(
      'https://api.example.com/documents'
    );
  });

  it('encodes query params and skips undefined values', () => {
    expect(
      buildUrl('documents', { q: 'a&b', page: 2, draft: undefined }, 'https://api.example.com')
    ).toBe('https://api.example.com/documents?q=a%26b&page=2');
  });
});

describe('apiClient', () => {
  it('returns parsed JSON on success', async () => {
    mockFetchResponse(200, [{ id: '1' }]);
    await expect(apiClient.get('/documents')).resolves.toEqual([{ id: '1' }]);
  });

  it('sends a JSON body and bearer token', async () => {
    const fetchSpy = mockFetchResponse(201, { id: '2' });
    setAccessTokenGetter(() => 'secret-token');

    await apiClient.post('/documents', { body: { title: 'New' } });

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://api.example.com/documents');
    expect(init).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ title: 'New' }),
      headers: expect.objectContaining({
        'Content-Type': 'application/json',
        Authorization: 'Bearer secret-token',
      }),
    });
  });

  it('throws ApiError with status and body on failure', async () => {
    mockFetchResponse(404, { message: 'Not found' });

    const error = await apiClient.get('/documents/missing').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, body: { message: 'Not found' } });
  });

  it('returns undefined for an empty 204 response', async () => {
    mockFetchResponse(204);
    await expect(apiClient.delete('/documents/1')).resolves.toBeUndefined();
  });
});
