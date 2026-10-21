/** @jest-environment node */
import { ANALYZE_FIELDS, analysisJobStateSchema } from '@/shared/analysis/contract';
import { API_HEADERS } from '@/shared/api-headers';
import { MAX_DOCUMENT_BYTES } from '@/shared/limits';

import { readBetaReport } from '../../metrics/beta-report';
import { hashDeviceId } from '../../privacy/pseudonyms';
import { StoreUnavailableError } from '../../store/counter-store';
import {
  CLIENT_HEADERS,
  jobRequest,
  jobUrl,
  jpeg,
  minimalPdf,
  pdf,
  TEST_JOB_ID,
  TEST_PUSH_TOKEN,
  uploadRequest,
} from '../../testing/analysis-request';
import { gatedProvider, settle } from '../../testing/gated-provider';
import { testJobDeps, type TestJobDeps } from '../../testing/server-deps';
import * as inspectPdfModule from '../inspect-pdf';
import { handleDeleteAnalysis, handleGetAnalysis } from './handle-analysis-job';
import { handlePutAnalysis } from './handle-put-analysis';

let deps: TestJobDeps;

/** The `{jobId}` of the path, as the router passes it. */
function idOf(request: Request) {
  return new URL(request.url).pathname.split('/').at(-1);
}

function put(request = uploadRequest(), on: TestJobDeps = deps) {
  return handlePutAnalysis(request, idOf(request), on);
}

async function get(jobId = TEST_JOB_ID) {
  const request = jobRequest('GET', { jobId });
  return handleGetAnalysis(request, idOf(request), deps);
}

async function remove(jobId = TEST_JOB_ID) {
  const request = jobRequest('DELETE', { jobId });
  return handleDeleteAnalysis(request, idOf(request), deps);
}

/** Uploads, waits for the model and fetches the result: an analysis the device got. */
async function analyzed(jobId = crypto.randomUUID()) {
  expect((await put(uploadRequest({ jobId }))).status).toBe(202);
  await deps.worker.idle();
  expect((await get(jobId)).status).toBe(200);
  expect((await remove(jobId)).status).toBe(204);
}

const fromDevice = (deviceId: string, ip = '203.0.113.7') =>
  uploadRequest({
    jobId: crypto.randomUUID(),
    headers: { [API_HEADERS.deviceId]: deviceId, 'X-Real-IP': ip },
  });

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

async function stateOf(response: Response) {
  return analysisJobStateSchema.parse(await response.json());
}

const ofType = (event: string) => deps.events.filter((logged) => logged.event === event);

function testDevice() {
  return hashDeviceId(CLIENT_HEADERS[API_HEADERS.deviceId], deps.deviceHashKey);
}

beforeEach(() => {
  deps = testJobDeps();
  // pdf-lib reports skipped objects of damaged files on the console.
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

describe('handlePutAnalysis 202', () => {
  it('queues the job and answers at once, without waiting for the model', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });

    const first = await put();
    const second = await put(uploadRequest({ jobId: crypto.randomUUID() }));
    const third = await put(uploadRequest({ jobId: crypto.randomUUID() }));

    expect(first.status).toBe(202);
    expect(await stateOf(first)).toEqual({ status: 'processing' });
    expect(await stateOf(second)).toEqual({ status: 'queued', ahead: 1 });
    expect(await stateOf(third)).toEqual({ status: 'queued', ahead: 2 });
    expect(calls).toHaveLength(1);
  });

  it('counts the pages of a PDF on the server (D-4)', async () => {
    await put(uploadRequest({ files: [pdf(minimalPdf({ pages: 3 }))] }));
    await deps.worker.idle();

    expect(await stateOf(await get())).toMatchObject({ status: 'done', pageCount: 3 });
  });

  it('gives the model the files in order with the locale, date and time zone', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    const first = jpeg(10);
    const second = jpeg(20);

    await put(uploadRequest({ files: [first, second], fields: { [ANALYZE_FIELDS.locale]: 'en' } }));

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toMatchObject({
      locale: 'en',
      today: '2026-10-18',
      timezone: 'Europe/Berlin',
      signal: expect.any(AbortSignal),
    });
    expect(calls[0].input.files).toEqual([
      { mimeType: 'image/jpeg', bytes: first.bytes },
      { mimeType: 'image/jpeg', bytes: second.bytes },
    ]);
  });

  it('keeps the interface language and the push token on the job (ANL-12)', async () => {
    const { provider } = gatedProvider();
    deps = testJobDeps({ provider });
    const upper = TEST_JOB_ID.toUpperCase();

    await put(
      uploadRequest({
        jobId: upper,
        fields: { [ANALYZE_FIELDS.uiLocale]: 'en', [ANALYZE_FIELDS.pushToken]: TEST_PUSH_TOKEN },
      })
    );

    expect(deps.jobs.get(await testDevice(), TEST_JOB_ID)).toMatchObject({
      uiLocale: 'en',
      pushToken: TEST_PUSH_TOKEN,
      jobId: TEST_JOB_ID,
    });
  });

  it('serves the minimum app version and newer ones', async () => {
    deps = { ...testJobDeps(), minAppVersion: [1, 2, 0] };
    for (const version of ['1.2.0', '1.10.0', '2.0.0']) {
      const response = await put(
        uploadRequest({
          jobId: crypto.randomUUID(),
          headers: { [API_HEADERS.appVersion]: version },
        })
      );
      expect(response.status).toBe(202);
    }
  });

  it('answers a repeated upload with the state of its job, without reading it (ANL-9)', async () => {
    const { provider, calls } = gatedProvider();
    // Over its limits too: a repeat finds its job before they are checked.
    deps = testJobDeps({ provider, limits: { ipPerHour: 1 } });
    await put();

    const repeat = uploadRequest();
    const response = await put(repeat);

    expect(response.status).toBe(202);
    expect(await stateOf(response)).toEqual({ status: 'processing' });
    expect(repeat.bodyUsed).toBe(false);
    expect(calls).toHaveLength(1);

    calls[0].answer();
    await settle();
    expect(await stateOf(await put())).toMatchObject({ status: 'done', pageCount: 1 });
    expect(ofType('upload.end').map((event) => event.code)).toEqual([
      'accepted',
      'existing',
      'existing',
    ]);
  });

  it('makes one job of the same upload sent twice at once', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });

    const responses = await Promise.all([put(), put()]);

    expect(responses.map((response) => response.status)).toEqual([202, 202]);
    expect(calls).toHaveLength(1);
    expect(deps.jobs.queued()).toBe(0);
    expect(deps.jobs.unfinished(await testDevice())).toBe(1);
    expect(ofType('upload.end').map((event) => event.code)).toEqual(
      expect.arrayContaining(['accepted', 'existing'])
    );
  });
});

describe('handlePutAnalysis 400 invalid_request', () => {
  it.each([
    ['no files', { files: [] }],
    ['a file field that is text', { files: ['not a file'] }],
    ['a PNG', { files: [{ ...jpeg(), type: 'image/png' }] }],
    ['a JPEG that is not one', { files: [{ bytes: new Uint8Array(64), type: 'image/jpeg' }] }],
    ['a PDF mixed with images', { files: [pdf(minimalPdf()), jpeg()] }],
    ['two PDFs', { files: [pdf(minimalPdf()), pdf(minimalPdf())] }],
    ['an unsupported locale', { fields: { [ANALYZE_FIELDS.locale]: 'de' } }],
    ['no locale', { fields: { [ANALYZE_FIELDS.locale]: undefined } }],
    ['a date that is not in the calendar', { fields: { [ANALYZE_FIELDS.today]: '2026-02-30' } }],
    ['a date in another format', { fields: { [ANALYZE_FIELDS.today]: '18.10.2026' } }],
    ['an unknown time zone', { fields: { [ANALYZE_FIELDS.timezone]: 'Mars/Olympus' } }],
    ['no interface language', { fields: { [ANALYZE_FIELDS.uiLocale]: undefined } }],
    ['an unsupported interface language', { fields: { [ANALYZE_FIELDS.uiLocale]: 'de' } }],
    ['a push token that is not one', { fields: { [ANALYZE_FIELDS.pushToken]: 'token' } }],
    ['an empty push token', { fields: { [ANALYZE_FIELDS.pushToken]: '' } }],
    ['a job id that is not a UUID', { jobId: 'job-1' }],
    ['a job id that is not a UUID v4', { jobId: '3d0f6c1e-8a2b-1c5d-9e6f-7a8b9c0d1e2f' }],
    ['no device id', { headers: { [API_HEADERS.deviceId]: undefined } }],
    ['a device id that is not a UUID', { headers: { [API_HEADERS.deviceId]: 'device-1' } }],
    ['an unknown platform', { headers: { [API_HEADERS.platform]: 'windows' } }],
    ['no app version', { headers: { [API_HEADERS.appVersion]: undefined } }],
    ['an app version that is not semver', { headers: { [API_HEADERS.appVersion]: '1.0' } }],
  ])('for %s, without making a job', async (_label, options) => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });

    const response = await put(uploadRequest(options));

    await expectError(response, 400, 'invalid_request');
    expect(calls).toHaveLength(0);
    expect(deps.jobs.queued()).toBe(0);
    expect(deps.jobs.get(await testDevice(), TEST_JOB_ID)).toBeUndefined();
  });

  it('for a body that is not multipart', async () => {
    const request = new Request(jobUrl(), {
      method: 'PUT',
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: [] }),
    });

    await expectError(await put(request), 400, 'invalid_request');
  });

  it('for a multipart body that is cut off', async () => {
    const request = new Request(jobUrl(), {
      method: 'PUT',
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'multipart/form-data; boundary=xyz' },
      body: '--xyz\r\nContent-Disposition: form-data; name="locale"\r\n\r\nru',
    });

    await expectError(await put(request), 400, 'invalid_request');
  });
});

describe('handlePutAnalysis 413 too_large', () => {
  it('for more than 30 images', async () => {
    const files = Array.from({ length: 31 }, () => jpeg(16));
    await expectError(await put(uploadRequest({ files })), 413, 'too_large');
  });

  it('for a PDF with more than 30 pages', async () => {
    const files = [pdf(minimalPdf({ pages: 31 }))];
    await expectError(await put(uploadRequest({ files })), 413, 'too_large');
  });

  it('for files over the size limit', async () => {
    const files = [jpeg(MAX_DOCUMENT_BYTES - 100), jpeg(200)];
    await expectError(await put(uploadRequest({ files })), 413, 'too_large');
  });

  it('for a declared Content-Length over the limit, without reading the body', async () => {
    const request = new Request(jobUrl(), {
      method: 'PUT',
      headers: {
        ...CLIENT_HEADERS,
        'Content-Type': 'multipart/form-data; boundary=xyz',
        'Content-Length': String(MAX_DOCUMENT_BYTES * 2),
      },
      body: 'never read',
    });
    const read = jest.spyOn(request, 'formData');

    await expectError(await put(request), 413, 'too_large');
    expect(read).not.toHaveBeenCalled();
    expect(request.bodyUsed).toBe(false);
  });

  it('for a streamed body that runs over the limit', async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);
        if (sent > MAX_DOCUMENT_BYTES * 2) controller.close();
      },
    });
    const request = new Request(jobUrl(), {
      method: 'PUT',
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'multipart/form-data; boundary=xyz' },
      body,
      duplex: 'half',
    } as RequestInit);

    await expectError(await put(request), 413, 'too_large');
    expect(sent).toBeLessThan(MAX_DOCUMENT_BYTES * 1.2);
    expect(deps.jobs.queued()).toBe(0);
  });
});

describe('handlePutAnalysis 422', () => {
  it('encrypted_pdf for a PDF with a password', async () => {
    const files = [pdf(minimalPdf({ encrypted: true }))];
    await expectError(await put(uploadRequest({ files })), 422, 'encrypted_pdf');
  });

  it('invalid_pdf for a damaged PDF', async () => {
    const files = [pdf(new TextEncoder().encode('%PDF-1.7\nnot really'))];
    await expectError(await put(uploadRequest({ files })), 422, 'invalid_pdf');
  });

  it('invalid_pdf for a file that only says it is a PDF', async () => {
    const files = [pdf(jpeg().bytes)];
    await expectError(await put(uploadRequest({ files })), 422, 'invalid_pdf');
  });
});

it('426 upgrade_required for an app below the minimum version, before reading the body', async () => {
  deps = { ...testJobDeps(), minAppVersion: [1, 2, 0] };
  const request = uploadRequest({ headers: { [API_HEADERS.appVersion]: '1.1.9' } });

  await expectError(await put(request), 426, 'upgrade_required');
  expect(request.bodyUsed).toBe(false);
});

describe('handlePutAnalysis limits (SPEC §8.3)', () => {
  it('429 rate_limited with Retry-After once the device used its analyses, before reading the body', async () => {
    deps = testJobDeps({ limits: { devicePerDay: 2 } });
    await analyzed();
    await analyzed();
    const request = uploadRequest();

    const response = await put(request);

    await expectError(response, 429, 'rate_limited');
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
    expect(request.bodyUsed).toBe(false);
    expect(ofType('upload.end').at(-1)).toMatchObject({ status: 429, kind: null });
  });

  it('429 rate_limited when unfinished jobs would take the rest of the daily limit', async () => {
    deps = testJobDeps({ limits: { devicePerDay: 3 } });
    await analyzed();
    // Done, but the app hasn't fetched them: unfinished.
    expect((await put(uploadRequest({ jobId: crypto.randomUUID() }))).status).toBe(202);
    expect((await put(uploadRequest({ jobId: crypto.randomUUID() }))).status).toBe(202);
    await deps.worker.idle();

    await expectError(await put(), 429, 'rate_limited');
  });

  it('429 too_many_jobs for a fourth unfinished job, before reading the body', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider });
    const ids = [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()];
    for (const jobId of ids) expect((await put(uploadRequest({ jobId }))).status).toBe(202);
    const request = uploadRequest();

    const response = await put(request);

    await expectError(response, 429, 'too_many_jobs');
    expect(response.headers.get('Retry-After')).toBeNull();
    expect(request.bodyUsed).toBe(false);
    expect((await put(fromDevice(crypto.randomUUID()))).status).toBe(202);

    // Done, the job is unfinished until the app gets the result.
    calls[0].answer();
    await settle();
    await expectError(await put(), 429, 'too_many_jobs');
    await get(ids[0]);
    expect((await put()).status).toBe(202);
  });

  it('limits attempts from one IP address whatever the device id says', async () => {
    deps = testJobDeps({ limits: { ipPerHour: 2 } });

    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await put(fromDevice(crypto.randomUUID()))).status);
    }
    const otherNetwork = await put(fromDevice(crypto.randomUUID(), '198.51.100.1'));

    expect(statuses).toEqual([202, 202, 429]);
    expect(otherNetwork.status).toBe(202);
  });

  it('503 with Retry-After once the day’s budget is spent', async () => {
    const { provider, calls } = gatedProvider();
    deps = testJobDeps({ provider, limits: { dailyBudgetUsd: 1 } });
    await put();
    calls[0].answer(undefined, 1);
    await settle();

    const response = await put(fromDevice(crypto.randomUUID()));

    await expectError(response, 503, 'unavailable');
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
  });

  it('503 with Retry-After 60 when the queue is full, before reading the body', async () => {
    const { provider } = gatedProvider();
    deps = testJobDeps({ provider, queueMax: 2 });
    // One running, two waiting.
    for (let i = 0; i < 3; i++)
      expect((await put(fromDevice(crypto.randomUUID()))).status).toBe(202);
    const request = fromDevice(crypto.randomUUID());

    const response = await put(request);

    await expectError(response, 503, 'unavailable');
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(request.bodyUsed).toBe(false);
  });

  it('still takes uploads when the counter store is down', async () => {
    deps = testJobDeps({
      store: {
        run: async () => {
          throw new StoreUnavailableError('down');
        },
      },
    });

    const response = await put();

    expect(response.status).toBe(202);
    await deps.worker.idle();
    expect(ofType('limits.unavailable').map((event) => event.step)).toEqual([
      'begin',
      'upload',
      'job',
    ]);
    expect(await stateOf(await get())).toMatchObject({ status: 'done' });
  });

  it('counts the beta metrics of the upload', async () => {
    await put();
    await put(
      uploadRequest({
        jobId: crypto.randomUUID(),
        files: [pdf(minimalPdf({ encrypted: true }))],
      })
    );
    await deps.worker.idle();

    const [today] = await readBetaReport(deps.store, deps.now(), 1);

    expect(today).toMatchObject({
      started: 2,
      ended: 2,
      interrupted: 0,
      uploads: expect.objectContaining({ accepted: 1, encrypted_pdf: 1 }),
      jobs: expect.objectContaining({ ok: 1 }),
      withDeadline: 1,
      devices: 1,
    });
  });
});

describe('handlePutAnalysis logs', () => {
  it('logs a start and an end with metadata of the upload', async () => {
    await put(
      uploadRequest({
        files: [jpeg(1000), jpeg(2000)],
        fields: { [ANALYZE_FIELDS.pushToken]: TEST_PUSH_TOKEN },
      })
    );

    const [start, end] = deps.events.filter((event) => event.event.startsWith('upload.'));
    expect(start).toEqual({
      event: 'upload.start',
      requestId: expect.any(String),
      device: expect.stringMatching(/^[0-9a-f]{16}$/),
      job: expect.stringMatching(/^[0-9a-f]{16}$/),
      platform: 'android',
      appVersion: '1.0.0',
      bodyBytes: null,
    });
    expect(start.job).not.toBe(start.device);
    expect(end).toEqual({
      event: 'upload.end',
      requestId: start.requestId,
      job: start.job,
      status: 202,
      code: 'accepted',
      error: null,
      ms: expect.any(Number),
      kind: 'images',
      pages: 2,
      bytes: 3000,
      locale: 'ru',
      push: true,
      // The worker took the job at once.
      ahead: null,
    });
  });

  it('logs how many jobs are ahead of a queued one', async () => {
    const { provider } = gatedProvider();
    deps = testJobDeps({ provider });
    await put();
    await put(uploadRequest({ jobId: crypto.randomUUID() }));

    expect(ofType('upload.end').map((event) => event.ahead)).toEqual([null, 1]);
  });

  it('uses the Cf-Ray id, which the EAS dashboard looks requests up by', async () => {
    await put(uploadRequest({ headers: { 'Cf-Ray': '8f1d2c3b4a5e6f70-FRA' } }));

    expect(
      deps.events.filter((event) => event.event.startsWith('upload.')).map((e) => e.requestId)
    ).toEqual(['8f1d2c3b4a5e6f70-FRA', '8f1d2c3b4a5e6f70-FRA']);
  });

  it('logs only the end when the client headers are wrong', async () => {
    await put(uploadRequest({ headers: { [API_HEADERS.deviceId]: 'x' } }));

    expect(deps.events).toEqual([
      expect.objectContaining({ event: 'upload.end', status: 400, code: 'invalid_request' }),
    ]);
    expect(deps.events[0]).toMatchObject({ job: null, kind: null });
  });

  it('logs how far a rejected upload got', async () => {
    await put(uploadRequest({ files: [pdf(minimalPdf({ encrypted: true }))] }));

    expect(ofType('upload.end')[0]).toMatchObject({
      status: 422,
      code: 'encrypted_pdf',
      kind: 'pdf',
      pages: null,
      push: false,
    });
    expect(ofType('analysis.start')).toHaveLength(0);
  });

  it('leaves an upload the client broke off without an end, and frees its place (SPEC §8.7)', async () => {
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        controller.abort();
        stream.error(new TypeError('terminated'));
      },
    });
    const request = new Request(jobUrl(), {
      method: 'PUT',
      headers: { ...CLIENT_HEADERS, 'Content-Type': 'multipart/form-data; boundary=xyz' },
      body,
      duplex: 'half',
      signal: controller.signal,
    } as RequestInit);

    await expect(put(request)).rejects.toThrow();
    expect(deps.events.map((event) => event.event)).toEqual(['upload.start']);
    expect(deps.jobs.queued()).toBe(0);
    expect(deps.jobs.unfinished(await testDevice())).toBe(0);
  });

  it('rethrows an unexpected error without its message, which can quote content', async () => {
    jest
      .spyOn(inspectPdfModule, 'inspectPdf')
      .mockRejectedValue(new SyntaxError('Unexpected token in "Счёт за электричество"'));

    const failure = put(uploadRequest({ files: [pdf(minimalPdf())] }));

    await expect(failure).rejects.toMatchObject({
      name: 'SyntaxError',
      message: '[message redacted]',
      stack: expect.not.stringContaining('Счёт'),
    });
    expect(ofType('upload.end')[0]).toMatchObject({
      status: 500,
      code: 'internal',
      error: 'SyntaxError',
    });
    expect(deps.jobs.queued()).toBe(0);
  });
});
