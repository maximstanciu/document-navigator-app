/** @jest-environment node */
import { StoreUnavailableError } from './counter-store';
import { UpstashCounterStore } from './upstash-counter-store';

const URL_ = 'https://eu1-test.upstash.io/';

function storeAnswering(response: Response | Error) {
  const fetchMock = jest.fn(async (_url: string, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return response;
  });
  const store = new UpstashCounterStore({
    url: URL_,
    token: 'secret-token',
    fetch: fetchMock as unknown as typeof fetch,
  });
  return { store, fetchMock };
}

describe('UpstashCounterStore', () => {
  it('sends the commands as one pipeline with the token', async () => {
    const { store, fetchMock } = storeAnswering(
      Response.json([{ result: '3' }, { result: 4 }, { result: 1 }, { result: ['a', 'b'] }])
    );

    const values = await store.run([
      ['GET', 'k'],
      ['INCRBY', 'n', 2],
      ['EXPIRE', 'n', 60],
      ['SMEMBERS', 's'],
    ]);

    expect(values).toEqual(['3', 4, 1, ['a', 'b']]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://eu1-test.upstash.io/pipeline');
    expect(init).toMatchObject({
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token', 'Content-Type': 'application/json' },
      signal: expect.any(AbortSignal),
    });
    expect(JSON.parse(init!.body as string)).toEqual([
      ['GET', 'k'],
      ['INCRBY', 'n', '2'],
      ['EXPIRE', 'n', '60'],
      ['SMEMBERS', 's'],
    ]);
  });

  it('makes no request for no commands', async () => {
    const { store, fetchMock } = storeAnswering(Response.json([]));
    await expect(store.run([])).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['the network fails', new TypeError('fetch failed')],
    ['the token is wrong', new Response('{"error":"Unauthorized"}', { status: 401 })],
    ['a command is refused', Response.json([{ error: 'ERR value is not an int' }])],
    ['the body is not a pipeline answer', Response.json({ result: 'OK' })],
    ['an answer is missing', Response.json([])],
  ])('is unavailable when %s, without passing on what Upstash said', async (_case, response) => {
    const { store } = storeAnswering(response);

    const failure = store.run([['INCR', 'k']]);

    await expect(failure).rejects.toBeInstanceOf(StoreUnavailableError);
    await expect(failure).rejects.not.toThrow(/Unauthorized|ERR/);
  });
});
