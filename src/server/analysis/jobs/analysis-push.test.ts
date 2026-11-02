/** @jest-environment node */
import { TEST_PUSH_TOKEN } from '../../testing/analysis-request';
import {
  analysisPushMessage,
  createPushSender,
  EXPO_PUSH_URL,
  expoPushSender,
  type AnalysisPushMessage,
} from './analysis-push';

const JOB_ID = '3f2b8c1e-4d5a-4b6c-9e7f-8a9b0c1d2e3f';

const message: AnalysisPushMessage = analysisPushMessage({
  to: TEST_PUSH_TOKEN,
  jobId: JOB_ID,
  uiLocale: 'en',
  status: 'done',
});

type Answer = Response | Error;

/** A `fetch` that answers the calls in turn with `answers` and records what it was asked. */
function fakeFetch(...answers: Answer[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = jest.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const answer = answers[calls.length - 1];
    if (!answer) throw new Error('No more answers.');
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return { fetch: fetch as typeof globalThis.fetch, calls };
}

function sender(fetch: typeof globalThis.fetch, timeoutMs?: number) {
  return expoPushSender({ accessToken: 'expo-token', fetch, retryDelayMs: 0, timeoutMs });
}

const ticket = (value: object) => Response.json({ data: value });
const ok = () => ticket({ status: 'ok', id: 'XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX' });
const requestError = (status: number, code: string) =>
  Response.json({ errors: [{ code, message: 'Request failed.' }] }, { status });

describe('analysisPushMessage', () => {
  it.each([
    ['ru', 'done', 'Документ разобран. Откройте приложение, чтобы посмотреть результат.'],
    ['ru', 'failed', 'Не удалось разобрать документ. Откройте приложение, чтобы повторить.'],
    ['en', 'done', 'A document has been analyzed. Open the app to see the result.'],
    ['en', 'failed', "A document couldn't be analyzed. Open the app to try again."],
  ] as const)('writes a neutral %s text for a %s job (ANL-12)', (uiLocale, status, body) => {
    expect(analysisPushMessage({ to: TEST_PUSH_TOKEN, jobId: JOB_ID, uiLocale, status })).toEqual({
      to: TEST_PUSH_TOKEN,
      body,
      data: { type: 'analysis', jobId: JOB_ID },
      channelId: 'analysis',
      priority: 'high',
    });
  });

  it('has no title', () => {
    expect(message).not.toHaveProperty('title');
  });
});

describe('expoPushSender', () => {
  it('posts the message to Expo Push Service with the access token', async () => {
    const { fetch, calls } = fakeFetch(ok());

    expect(await sender(fetch)(message)).toBe('ok');

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls;
    expect(url).toBe(EXPO_PUSH_URL);
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: 'Bearer expo-token',
    });
    expect(JSON.parse(init.body as string)).toEqual(message);
  });

  it('reads a ticket in a list too', async () => {
    const { fetch } = fakeFetch(Response.json({ data: [{ status: 'ok', id: 'id' }] }));
    expect(await sender(fetch)(message)).toBe('ok');
  });

  it.each(['DeviceNotRegistered', 'MessageTooBig', 'MessageRateExceeded', 'InvalidCredentials'])(
    'returns the ticket error %s without retrying',
    async (error) => {
      const { fetch, calls } = fakeFetch(
        ticket({ status: 'error', message: 'Not delivered.', details: { error } })
      );

      expect(await sender(fetch)(message)).toBe(error);
      expect(calls).toHaveLength(1);
    }
  );

  it('calls a ticket error it doesn’t know, or one without a code, unexpected', async () => {
    const unknown = fakeFetch(
      ticket({ status: 'error', message: 'Odd.', details: { error: 'Odd' } })
    );
    const bare = fakeFetch(ticket({ status: 'error', message: 'Odd.' }));

    expect(await sender(unknown.fetch)(message)).toBe('unexpected');
    expect(await sender(bare.fetch)(message)).toBe('unexpected');
  });

  it('retries once after a network error', async () => {
    const { fetch, calls } = fakeFetch(new TypeError('fetch failed'), ok());

    expect(await sender(fetch)(message)).toBe('ok');
    expect(calls).toHaveLength(2);
  });

  it('gives up after a second network error', async () => {
    const { fetch, calls } = fakeFetch(new TypeError('fetch failed'), new TypeError('again'));

    expect(await sender(fetch)(message)).toBe('network');
    expect(calls).toHaveLength(2);
  });

  it('counts a request that takes too long as a network error', async () => {
    const calls: AbortSignal[] = [];
    const hanging = ((_url: string, init: RequestInit) => {
      const signal = init.signal!;
      calls.push(signal);
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true });
      });
    }) as typeof globalThis.fetch;

    expect(await sender(hanging, 5)(message)).toBe('network');
    expect(calls).toHaveLength(2);
    expect(calls.every((signal) => signal.aborted)).toBe(true);
  });

  it.each([
    ['5xx', () => new Response('Bad gateway', { status: 502 }), 'server_error'],
    ['429', () => requestError(429, 'TOO_MANY_REQUESTS'), 'TOO_MANY_REQUESTS'],
  ])('retries once after a %s', async (_label, answer, outcome) => {
    const twice = fakeFetch(answer(), answer());
    const once = fakeFetch(answer(), ok());

    expect(await sender(twice.fetch)(message)).toBe(outcome);
    expect(twice.calls).toHaveLength(2);
    expect(await sender(once.fetch)(message)).toBe('ok');
  });

  it('returns UNAUTHORIZED for a wrong access token, without retrying', async () => {
    const { fetch, calls } = fakeFetch(requestError(401, 'UNAUTHORIZED'));

    expect(await sender(fetch)(message)).toBe('UNAUTHORIZED');
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['another request error', () => requestError(400, 'PUSH_TOO_MANY_EXPERIENCE_IDS')],
    ['a body that is not JSON', () => new Response('<html>', { status: 200 })],
    ['JSON of another shape', () => Response.json({ data: 'ok' })],
    ['no ticket', () => Response.json({})],
  ])('returns unexpected for %s', async (_label, answer) => {
    const { fetch, calls } = fakeFetch(answer());

    expect(await sender(fetch)(message)).toBe('unexpected');
    expect(calls).toHaveLength(1);
  });
});

describe('createPushSender', () => {
  it('sends no push without EXPO_ACCESS_TOKEN', () => {
    expect(createPushSender({})).toBeNull();
    expect(createPushSender({ EXPO_ACCESS_TOKEN: '' })).toBeNull();
  });

  it('sends through Expo Push Service with EXPO_ACCESS_TOKEN', async () => {
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(ok());
    const push = createPushSender({ EXPO_ACCESS_TOKEN: 'expo-token' });

    expect(await push!(message)).toBe('ok');
    expect(fetch).toHaveBeenCalledWith(
      EXPO_PUSH_URL,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer expo-token' }),
      })
    );
    fetch.mockRestore();
  });
});
