/** @jest-environment node */
import { ANALYZE_FIELDS, analysisJobStateSchema } from '@/shared/analysis/contract';
import { ANALYSIS_FIXTURES, llmOutputFixture } from '@/shared/analysis/fixtures';
import { API_HEADERS } from '@/shared/api-headers';

import type { PushOutcome } from '../../limits/usage-keys';
import { readBetaReport } from '../../metrics/beta-report';
import { hashDeviceId } from '../../privacy/pseudonyms';
import {
  CLIENT_HEADERS,
  jobRequest,
  jpeg,
  TEST_JOB_ID,
  TEST_PUSH_TOKEN,
  uploadRequest,
} from '../../testing/analysis-request';
import { gatedProvider, settle } from '../../testing/gated-provider';
import { TEST_RESULT_TTL_MS, testJobDeps, type TestJobDeps } from '../../testing/server-deps';
import * as finalizeModule from '../finalize-analysis';
import { LlmProviderError, type LlmProvider } from '../llm-provider';
import { MockLlmProvider } from '../providers/mock-llm-provider';
import { analysisPushMessage, type AnalysisPushMessage } from './analysis-push';
import {
  handleDeleteAnalysis,
  handleGetAnalysis,
  handlePatchAnalysis,
} from './handle-analysis-job';
import { handlePutAnalysis } from './handle-put-analysis';

const OTHER_DEVICE = '0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const JOB_B = '9a7c5e3b-1d2f-4a6b-8c0d-2e4f6a8b0c1d';

let deps: TestJobDeps;

type Options = { jobId?: string; headers?: Record<string, string | undefined> };

function put(options: Parameters<typeof uploadRequest>[0] = {}) {
  return handlePutAnalysis(uploadRequest(options), options.jobId ?? TEST_JOB_ID, deps);
}

function get({ jobId = TEST_JOB_ID, headers }: Options = {}) {
  return handleGetAnalysis(jobRequest('GET', { jobId, headers }), jobId, deps);
}

function patch(body: BodyInit, { jobId = TEST_JOB_ID, headers }: Options = {}) {
  return handlePatchAnalysis(jobRequest('PATCH', { jobId, headers, body }), jobId, deps);
}

function remove({ jobId = TEST_JOB_ID, headers }: Options = {}) {
  return handleDeleteAnalysis(jobRequest('DELETE', { jobId, headers }), jobId, deps);
}

async function stateOf(response: Response) {
  expect(response.status).toBe(200);
  return analysisJobStateSchema.parse(await response.json());
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

const ofType = (event: string) => deps.events.filter((logged) => logged.event === event);

async function testDevice() {
  return hashDeviceId(CLIENT_HEADERS[API_HEADERS.deviceId], deps.deviceHashKey);
}

/** What is left of the test device's daily limit, by the counters alone. */
async function remaining() {
  return (await deps.usage.remaining(await testDevice(), 0)).remaining;
}

/** A provider that fails every call with `error`. */
function failing(error: unknown): LlmProvider {
  return {
    id: 'failing',
    analyze: async () => {
      throw error;
    },
  };
}

beforeEach(() => {
  deps = testJobDeps();
});

afterEach(() => jest.restoreAllMocks());

describe('an analysis job', () => {
  it('goes from the queue through processing to done, one job at a time', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    // The contract fixture quotes page 4.
    await put({ files: Array.from({ length: 4 }, () => jpeg()) });
    await put({ jobId: JOB_B });

    expect(await stateOf(await get())).toEqual({ status: 'processing' });
    expect(await stateOf(await get({ jobId: JOB_B }))).toEqual({ status: 'queued', ahead: 1 });

    calls[0].answer();
    await settle();

    expect(await stateOf(await get())).toEqual({
      status: 'done',
      analysis: ANALYSIS_FIXTURES.contract,
      pageCount: 4,
    });
    expect(await stateOf(await get({ jobId: JOB_B }))).toEqual({ status: 'processing' });
    expect(calls).toHaveLength(2);
  });

  it('runs as many jobs at once as ANALYSIS_CONCURRENCY allows', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider, concurrency: 2 });
    await put();
    await put({ jobId: JOB_B });
    const third = crypto.randomUUID();
    await put({ jobId: third });

    expect(calls).toHaveLength(2);
    expect(await stateOf(await get({ jobId: third }))).toEqual({ status: 'queued', ahead: 2 });
  });

  it('post-processes the answer with the upload’s date and page count (SPEC §7.4)', async () => {
    const { contract } = ANALYSIS_FIXTURES;
    const model = llmOutputFixture('contract');
    const [cancellation, renewal] = model.deadlines;
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();

    calls[0].answer({
      ...model,
      summary: `  ${contract.summary}  `,
      deadlines: [
        { ...cancellation, rule: { ...cancellation.rule!, fromDate: '2040-01-31' } },
        renewal,
      ],
    });
    await settle();

    const state = await stateOf(await get());
    expect(state.status).toBe('done');
    if (state.status !== 'done') return;
    expect(state.analysis.summary).toBe(contract.summary);
    // Three months before 2040-01-31 is more than 10 years after `today`: dropped, and its action
    // loses the link. The other deadline becomes d1, and its page 3 isn't in a one-page upload.
    expect(state.analysis.deadlines).toEqual([{ ...contract.deadlines[1], id: 'd1', page: null }]);
    expect(state.analysis.actions).toEqual([{ ...contract.actions[0], deadlineId: null }]);
  });

  it('lets the provider check the shape of an answer for its retry (SPEC §7.4)', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put({ files: Array.from({ length: 4 }, () => jpeg()) });

    const { checkShape } = calls[0].input;
    expect(checkShape?.(llmOutputFixture('contract'))).toBeNull();
    expect(checkShape?.({ ...llmOutputFixture('contract'), summary: 42 })).toContain('summary');
  });

  it('holds no reference to the files while the model works (SPEC §7.1)', async () => {
    let handed: unknown[] = [];
    let held: unknown = 'not checked';
    const device = await testDevice();
    const provider: LlmProvider = {
      id: 'owner',
      analyze: async (input) => {
        handed = input.files;
        held = deps.jobs.get(device, TEST_JOB_ID)?.input;
        // A real provider encodes the files and empties the array it was given.
        input.files.splice(0);
        return {
          result: llmOutputFixture('invoice'),
          usage: { inputTokens: 0, outputTokens: 0 },
          costUsd: 0,
        };
      },
    };
    deps = testJobDeps({ provider });

    await put({ files: [jpeg(), jpeg()] });
    await deps.worker.idle();

    expect(held).toBeNull();
    expect(handed).toEqual([]);
    expect(await stateOf(await get())).toMatchObject({ status: 'done', pageCount: 2 });
  });

  it('fails with analysis_failed when the model’s answer is invalid', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();

    calls[0].answer({ ...llmOutputFixture('contract'), summary: 42 });
    await settle();

    expect(await stateOf(await get())).toEqual({
      status: 'failed',
      error: { code: 'analysis_failed', message: expect.any(String) },
    });
    expect(ofType('analysis.end')[0]).toMatchObject({
      code: 'analysis_failed',
      modelMs: expect.any(Number),
      costUsd: 0.01,
      deadlines: null,
    });
  });

  it.each([
    ['a network error', new TypeError('fetch failed'), 'unavailable'],
    ['unavailable', new LlmProviderError('unavailable', 'down'), 'unavailable'],
    ['analysis_failed', new LlmProviderError('analysis_failed', 'cut off'), 'analysis_failed'],
    ['invalid_pdf from the renderer', new LlmProviderError('invalid_pdf', 'x'), 'analysis_failed'],
  ])('fails when the provider fails with %s', async (_label, error, code) => {
    deps = testJobDeps({ provider: failing(error) });
    await put();
    await deps.worker.idle();

    expect(await stateOf(await get())).toEqual({
      status: 'failed',
      error: { code, message: expect.any(String) },
    });
    expect(ofType('analysis.end')[0]).toMatchObject({ code, provider: 'failing' });
  });

  it('fails with unavailable on a bug, reported without its message', async () => {
    const report = jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(finalizeModule, 'finalizeAnalysis').mockImplementation(() => {
      throw new TypeError('Cannot read "Счёт за электричество"');
    });
    deps = testJobDeps({ provider: new MockLlmProvider() });

    await put();
    await deps.worker.idle();

    expect(await stateOf(await get())).toMatchObject({
      status: 'failed',
      error: { code: 'unavailable' },
    });
    expect(ofType('analysis.end')[0]).toMatchObject({ code: 'internal', error: 'TypeError' });
    expect(report).toHaveBeenCalledTimes(1);
    expect(String(report.mock.calls[0][0])).not.toContain('Счёт');
  });

  it('logs when it starts, how long it waited, and how it ended', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put({ fields: { [ANALYZE_FIELDS.locale]: 'en' } });
    await put({ jobId: JOB_B });
    deps.advance(5000);

    calls[0].answer();
    await settle();

    const [, second] = ofType('analysis.start');
    expect(second).toEqual({ event: 'analysis.start', job: expect.any(String), waitMs: 5000 });
    expect(ofType('analysis.end')[0]).toEqual({
      event: 'analysis.end',
      job: ofType('analysis.start')[0].job,
      code: 'ok',
      error: null,
      ms: 5000,
      kind: 'images',
      pages: 1,
      locale: 'en',
      provider: 'gated',
      modelMs: 5000,
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
      deadlines: 2,
      fraudSignals: 0,
      readable: true,
    });
  });
});

describe('GET /api/v1/analyses/{jobId}', () => {
  it('404 job_not_found for a job the device never uploaded', async () => {
    await expectError(await get(), 404, 'job_not_found');
  });

  it('404 job_not_found for another device’s job', async () => {
    await put();

    await expectError(
      await get({ headers: { [API_HEADERS.deviceId]: OTHER_DEVICE } }),
      404,
      'job_not_found'
    );
    expect((await get()).status).toBe(200);
  });

  it('checks the client headers and the job id first', async () => {
    deps = { ...testJobDeps(), minAppVersion: [2, 0, 0] };
    await expectError(await get(), 426, 'upgrade_required');

    deps = testJobDeps();
    await expectError(await get({ jobId: 'not-a-uuid' }), 400, 'invalid_request');
    await expectError(
      await get({ headers: { [API_HEADERS.platform]: 'tv' } }),
      400,
      'invalid_request'
    );
  });

  it('charges the daily limit once, on the first done the app gets (SPEC §8.3)', async () => {
    await put();
    await deps.worker.idle();
    deps.advance(7000);
    expect(await remaining()).toBe(10);

    expect(await stateOf(await get())).toMatchObject({ status: 'done' });
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });

    expect(await remaining()).toBe(9);
    expect(ofType('analysis.delivered')).toEqual([
      {
        event: 'analysis.delivered',
        job: ofType('analysis.end')[0].job,
        device: await testDevice(),
        sinceEndMs: 7000,
      },
    ]);
  });

  it('charges nothing for a failed job, a cancelled one or one in the queue', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();
    await put({ jobId: JOB_B });
    await get();
    await get({ jobId: JOB_B });
    await remove({ jobId: JOB_B });
    calls[0].fail(new LlmProviderError('unavailable', 'down'));
    await settle();

    expect(await stateOf(await get())).toMatchObject({ status: 'failed' });
    expect(await remaining()).toBe(10);
    expect(ofType('analysis.delivered')).toEqual([]);
  });
});

describe('DELETE /api/v1/analyses/{jobId}', () => {
  it('cancels a queued job: it never reaches the model and frees its place (ANL-13)', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();
    await put({ jobId: JOB_B });

    const response = await remove({ jobId: JOB_B });

    expect(response.status).toBe(204);
    await expectError(await get({ jobId: JOB_B }), 404, 'job_not_found');
    calls[0].answer();
    await settle();
    expect(calls).toHaveLength(1);
    expect(deps.jobs.unfinished(await testDevice())).toBe(1);
    expect(ofType('job.removed')).toEqual([
      { event: 'job.removed', job: expect.any(String), reason: 'cancelled', state: 'queued' },
    ]);
    expect(ofType('analysis.end')[0]).toMatchObject({
      job: ofType('job.removed')[0].job,
      code: 'cancelled',
      ms: null,
      provider: null,
    });
  });

  it('cancels a job during the model call: the call is aborted and the next job starts', async () => {
    deps = testJobDeps({ provider: new MockLlmProvider({ delayMs: 60 * 60 * 1000 }) });
    await put();
    await put({ jobId: JOB_B });

    expect((await remove()).status).toBe(204);
    await settle();

    await expectError(await get(), 404, 'job_not_found');
    expect(await stateOf(await get({ jobId: JOB_B }))).toEqual({ status: 'processing' });
    expect(ofType('job.removed')[0]).toMatchObject({ reason: 'cancelled', state: 'processing' });
    expect(ofType('analysis.end')[0]).toMatchObject({
      code: 'cancelled',
      provider: 'mock',
      ms: expect.any(Number),
    });

    await remove({ jobId: JOB_B });
    await deps.worker.idle();
    const [today] = await readBetaReport(deps.store, deps.now(), 1);
    expect(today.jobs).toMatchObject({ cancelled: 2, ok: 0 });
  });

  it('drops a result the model returns after the job was removed', async () => {
    let finish: () => void = () => {};
    const provider: LlmProvider = {
      id: 'deaf',
      // Doesn't listen to the signal: answers anyway.
      analyze: () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              result: llmOutputFixture('invoice'),
              usage: { inputTokens: 0, outputTokens: 0 },
              costUsd: 0,
            });
        }),
    };
    deps = testJobDeps({ provider });
    await put();
    await remove();

    finish();
    await deps.worker.idle();

    await expectError(await get(), 404, 'job_not_found');
    expect(ofType('analysis.end')[0]).toMatchObject({ code: 'cancelled' });
  });

  it('acknowledges a finished job the app has seen', async () => {
    await put();
    await deps.worker.idle();
    await get();

    expect((await remove()).status).toBe(204);
    expect((await remove()).status).toBe(204);

    await expectError(await get(), 404, 'job_not_found');
    expect(ofType('job.removed')).toEqual([
      { event: 'job.removed', job: expect.any(String), reason: 'ack', state: 'done' },
    ]);
  });

  it('answers 204 for an unknown job and leaves other devices’ jobs alone', async () => {
    await put();

    expect((await remove({ jobId: JOB_B })).status).toBe(204);
    expect((await remove({ headers: { [API_HEADERS.deviceId]: OTHER_DEVICE } })).status).toBe(204);

    expect((await get()).status).toBe(200);
    expect(ofType('job.removed')).toEqual([]);
  });

  it('checks the client headers and the job id first', async () => {
    await expectError(await remove({ jobId: 'job-1' }), 400, 'invalid_request');
    deps = { ...testJobDeps(), minAppVersion: [2, 0, 0] };
    await expectError(await remove(), 426, 'upgrade_required');
  });
});

describe('PATCH /api/v1/analyses/{jobId}', () => {
  it('sets the push token of the job (ANL-12)', async () => {
    const { provider } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();
    const token = 'ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]';

    const response = await patch(JSON.stringify({ pushToken: token }));

    expect(response.status).toBe(204);
    expect(deps.jobs.get(await testDevice(), TEST_JOB_ID)?.pushToken).toBe(token);
  });

  it('404 job_not_found for an unknown job or another device’s', async () => {
    await put();
    const body = JSON.stringify({ pushToken: TEST_PUSH_TOKEN });

    await expectError(await patch(body, { jobId: JOB_B }), 404, 'job_not_found');
    await expectError(
      await patch(body, { headers: { [API_HEADERS.deviceId]: OTHER_DEVICE } }),
      404,
      'job_not_found'
    );
  });

  it.each([
    ['no token', '{}'],
    ['a token that is not one', JSON.stringify({ pushToken: 'abc' })],
    ['a body that is not JSON', 'pushToken=abc'],
    [
      'a body that is too long',
      JSON.stringify({ pushToken: TEST_PUSH_TOKEN, pad: 'x'.repeat(5000) }),
    ],
  ])('400 invalid_request for %s', async (_label, body) => {
    await put();
    await expectError(await patch(body), 400, 'invalid_request');
  });
});

describe('the push about the end of a job (ANL-12)', () => {
  const withToken = { fields: { [ANALYZE_FIELDS.pushToken]: TEST_PUSH_TOKEN } };

  /** A push sender that records the messages and answers with `outcome` once `release` resolves. */
  function pushing(outcome: PushOutcome = 'ok', release: Promise<void> = Promise.resolve()) {
    const messages: AnalysisPushMessage[] = [];
    const push = jest.fn(async (message: AnalysisPushMessage) => {
      messages.push(message);
      await release;
      return outcome;
    });
    return { push, messages };
  }

  it('goes out once the result is ready, in the interface language', async () => {
    const { push, messages } = pushing();
    const statusWhenSent: (string | undefined)[] = [];
    push.mockImplementationOnce(async (message) => {
      messages.push(message);
      statusWhenSent.push(deps.jobs.get(await testDevice(), TEST_JOB_ID)?.result?.status);
      return 'ok';
    });
    deps = testJobDeps({ push });

    await put({ fields: { ...withToken.fields, [ANALYZE_FIELDS.uiLocale]: 'en' } });
    await deps.worker.idle();

    expect(messages).toEqual([
      analysisPushMessage({
        to: TEST_PUSH_TOKEN,
        jobId: TEST_JOB_ID,
        uiLocale: 'en',
        status: 'done',
      }),
    ]);
    expect(statusWhenSent).toEqual(['done']);
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });
  });

  it('tells about a failed job too', async () => {
    const { push, messages } = pushing();
    deps = testJobDeps({ push, provider: failing(new LlmProviderError('analysis_failed', 'x')) });

    await put(withToken);
    await deps.worker.idle();

    expect(messages).toEqual([
      analysisPushMessage({
        to: TEST_PUSH_TOKEN,
        jobId: TEST_JOB_ID,
        uiLocale: 'ru',
        status: 'failed',
      }),
    ]);
  });

  it('goes to the token the app gave last (PATCH)', async () => {
    const { provider, calls } = gatedProvider();
    const { push, messages } = pushing();
    deps = testJobDeps({ provider, push });
    const token = 'ExponentPushToken[yyyyyyyyyyyyyyyyyyyyyy]';
    await put();
    await patch(JSON.stringify({ pushToken: token }));

    calls[0].answer();
    await deps.worker.idle();

    expect(messages.map((message) => message.to)).toEqual([token]);
  });

  it('isn’t sent without a token, without EXPO_ACCESS_TOKEN or for a cancelled job', async () => {
    const { push } = pushing();
    deps = testJobDeps({ push });
    await put();
    await deps.worker.idle();
    expect(push).not.toHaveBeenCalled();

    deps = testJobDeps({ push: null });
    await put(withToken);
    await deps.worker.idle();
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });

    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider, push });
    await put(withToken);
    await remove();
    await deps.worker.idle();
    expect(calls[0].aborted()).toBe(true);
    expect(push).not.toHaveBeenCalled();
    expect(ofType('push.sent')).toEqual([]);
  });

  it('logs and counts how it went, never the token, and the result stays', async () => {
    const { push } = pushing('DeviceNotRegistered');
    deps = testJobDeps({ push });

    await put(withToken);
    await deps.worker.idle();

    const [end] = ofType('analysis.end');
    expect(ofType('push.sent')).toEqual([
      { event: 'push.sent', job: end.job, outcome: 'DeviceNotRegistered' },
    ]);
    expect(JSON.stringify(deps.events)).not.toContain(TEST_PUSH_TOKEN);
    const [today] = await readBetaReport(deps.store, deps.now(), 1);
    expect(today.pushes).toMatchObject({ DeviceNotRegistered: 1, ok: 0 });
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });
  });

  it('doesn’t hold up the next job', async () => {
    const { provider, calls } = gatedProvider();
    let release!: () => void;
    const { push } = pushing('ok', new Promise((resolve) => (release = resolve)));
    deps = testJobDeps({ provider, push });
    await put(withToken);
    await put({ jobId: JOB_B });

    calls[0].answer();
    await settle();

    expect(push).toHaveBeenCalledTimes(1);
    expect(calls).toHaveLength(2);
    expect(ofType('push.sent')).toEqual([]);

    release();
    calls[1].answer();
    await deps.worker.idle();
    expect(ofType('push.sent')).toHaveLength(1);
  });
});

describe('result retention', () => {
  it('keeps a finished job 24 hours after its end, then answers 404', async () => {
    await put();
    await deps.worker.idle();

    deps.advance(TEST_RESULT_TTL_MS - 1);
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });
    deps.advance(1);

    await expectError(await get(), 404, 'job_not_found');
    expect(ofType('job.removed')).toEqual([
      { event: 'job.removed', job: expect.any(String), reason: 'expired', state: 'done' },
    ]);
  });

  it('counts a result nobody fetched as lost, without charging it (SPEC §8.7)', async () => {
    await put();
    await deps.worker.idle();
    deps.advance(TEST_RESULT_TTL_MS);

    await expectError(await get(), 404, 'job_not_found');

    expect(await remaining()).toBe(10);
    expect(deps.jobs.unfinished(await testDevice())).toBe(0);
    const [today] = await readBetaReport(deps.store, deps.now() - TEST_RESULT_TTL_MS, 1);
    expect(today).toMatchObject({ expired: 1, delivered: 0 });
  });

  it('keeps a queued job however long it waits', async () => {
    const { provider } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();
    await put({ jobId: JOB_B });

    deps.advance(3 * TEST_RESULT_TTL_MS);

    expect(await stateOf(await get({ jobId: JOB_B }))).toEqual({ status: 'queued', ahead: 1 });
  });
});

it('never logs the document, its analysis, the ids or the push token (SPEC §7.1, §8.2)', async () => {
  const { fraudulentInvoice } = ANALYSIS_FIXTURES;
  const content = stringsIn(fraudulentInvoice).filter((text) => text.length >= 4);
  const fileName = 'Паспорт Иванова.jpg';
  const newToken = 'ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]';
  const { provider, calls } = gatedProvider();
  deps = testJobDeps({ provider });
  const files = [{ ...jpeg(), name: fileName }];
  const fields = { [ANALYZE_FIELDS.pushToken]: TEST_PUSH_TOKEN };

  await put({ files, fields });
  await put({ jobId: JOB_B, files, fields });
  await put({ jobId: TEST_JOB_ID, files, fields });
  await patch(JSON.stringify({ pushToken: newToken }), { jobId: JOB_B });
  calls[0].answer(llmOutputFixture('fraudulentInvoice'));
  await settle();
  calls[1].answer({ ...llmOutputFixture('fraudulentInvoice'), summary: 42 });
  await settle();
  await get();
  await get({ jobId: JOB_B });
  await remove();
  await remove({ jobId: JOB_B });
  await patch(JSON.stringify({ pushToken: 'Иванова' }));

  const logged = JSON.stringify(deps.events);
  expect(ofType('analysis.end')).toHaveLength(2);
  expect(content.length).toBeGreaterThan(10);
  for (const text of [
    ...content,
    fileName,
    TEST_PUSH_TOKEN,
    newToken,
    'Иванова',
    CLIENT_HEADERS[API_HEADERS.deviceId],
    TEST_JOB_ID,
    JOB_B,
  ]) {
    expect(logged).not.toContain(text);
  }
});

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}
