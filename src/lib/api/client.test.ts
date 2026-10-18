import { ApiError, ApiTimeoutError, apiClient, buildUrl, setAccessTokenGetter } from './client';

jest.mock('@/lib/env', () => ({ env: { apiUrl: 'https://api.example.com/' } }));
jest.mock('./client-headers', () => ({
  getClientHeaders: async () => ({
    'X-Device-Id': '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    'X-App-Version': '1.0.0',
    'X-Platform': 'ios',
  }),
}));

function mockFetchResponse(status: number, body?: unknown, headers?: Record<string, string>) {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(text || null, { status, headers }) as Response);
}

/** A server that never answers, but gives up when the request is aborted, like `fetch` does. */
function mockFetchHang() {
  return jest.spyOn(globalThis, 'fetch').mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        const abort = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        if (init?.signal?.aborted) abort();
        init?.signal?.addEventListener('abort', abort);
      })
  );
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

  it('sends the device id, app version and platform with every call (SPEC §7.2)', async () => {
    const fetchSpy = mockFetchResponse(200, {});

    await apiClient.get('/api/v1/limits');

    expect(fetchSpy.mock.calls[0][1]?.headers).toMatchObject({
      'X-Device-Id': '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      'X-App-Version': '1.0.0',
      'X-Platform': 'ios',
    });
  });

  it('sends FormData as it is, leaving the multipart Content-Type to fetch', async () => {
    const fetchSpy = mockFetchResponse(200, {});
    const form = new FormData();
    form.append('locale', 'ru');

    await apiClient.post('/api/v1/analyze', { body: form });

    const init = fetchSpy.mock.calls[0][1];
    expect(init?.body).toBe(form);
    expect(init?.headers).not.toHaveProperty('Content-Type');
  });

  it('keeps the response headers on ApiError, e.g. Retry-After', async () => {
    mockFetchResponse(
      429,
      { error: { code: 'rate_limited', message: 'Daily limit reached.' } },
      { 'Retry-After': '3600' }
    );

    const error = await apiClient.post('/api/v1/analyze').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).headers.get('Retry-After')).toBe('3600');
  });

  it('aborts with ApiTimeoutError when no response arrives in time', async () => {
    const fetchSpy = mockFetchHang();

    await expect(apiClient.post('/api/v1/analyze', { timeoutMs: 20 })).rejects.toBeInstanceOf(
      ApiTimeoutError
    );
    expect(fetchSpy.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("passes on the caller's own abort as it is, not as a timeout", async () => {
    mockFetchHang();
    const controller = new AbortController();

    const pending = apiClient.post('/api/v1/analyze', {
      timeoutMs: 60_000,
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
