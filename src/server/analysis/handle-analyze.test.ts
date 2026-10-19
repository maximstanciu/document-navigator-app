/** @jest-environment node */
import { ANALYZE_FIELDS, analyzeResponseSchema } from '@/shared/analysis/contract';
import { ANALYSIS_FIXTURES, llmOutputFixture } from '@/shared/analysis/fixtures';
import { API_HEADERS } from '@/shared/api-headers';
import { MAX_DOCUMENT_BYTES } from '@/shared/limits';

import {
  analyzeRequest,
  CLIENT_HEADERS,
  jpeg,
  minimalPdf,
  pdf,
  TEST_URL,
} from '../testing/analyze-request';
import type { LogEvent } from '../logs/server-log';
import { readBetaReport } from '../metrics/beta-report';
import { StoreUnavailableError } from '../store/counter-store';
import { testServerDeps, type TestServerDeps } from '../testing/server-deps';
import { handleAnalyze, type AnalyzeDeps } from './handle-analyze';
import * as inspectPdfModule from './inspect-pdf';
import type { LlmAnalyzeInput, LlmProvider } from './llm-provider';
import { MockLlmProvider } from './providers/mock-llm-provider';

let server: TestServerDeps;
let events: LogEvent[] = [];

function deps(overrides: Partial<AnalyzeDeps> = {}): AnalyzeDeps {
  return { ...server, provider: new MockLlmProvider(), ...overrides };
}

/** A provider that records what it got and answers with `result`. */
function recordingProvider(answer: () => Promise<unknown> = async () => validResult()) {
  const calls: LlmAnalyzeInput[] = [];
  const provider: LlmProvider = {
    id: 'recording',
    analyze: async (input) => {
      calls.push({ ...input, files: [...input.files] });
      return { result: await answer(), usage: { inputTokens: 1, outputTokens: 1 }, costUsd: 0 };
    },
  };
  return { provider, calls };
}

function validResult() {
  return llmOutputFixture('contract');
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

describe('handleAnalyze', () => {
  beforeEach(() => {
    server = testServerDeps();
    events = server.events;
    // pdf-lib reports skipped objects of damaged files on the console.
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  describe('200', () => {
    it('returns the analysis and the number of pages for images', async () => {
      const response = await handleAnalyze(analyzeRequest({ files: [jpeg(), jpeg()] }), deps());

      expect(response.status).toBe(200);
      const body = analyzeResponseSchema.parse(await response.json());
      expect(body).toEqual({ analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 });
    });

    it('counts the pages of a PDF on the server (D-4)', async () => {
      const response = await handleAnalyze(
        analyzeRequest({ files: [pdf(minimalPdf({ pages: 3 }))] }),
        deps()
      );

      expect(response.status).toBe(200);
      expect((await response.json()).pageCount).toBe(3);
    });

    it('gives the provider the files in order with the locale, date and time zone', async () => {
      const { provider, calls } = recordingProvider();
      const first = jpeg(10);
      const second = jpeg(20);

      const response = await handleAnalyze(
        analyzeRequest({ files: [first, second], fields: { [ANALYZE_FIELDS.locale]: 'en' } }),
        deps({ provider })
      );

      expect(response.status).toBe(200);
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        locale: 'en',
        today: '2026-10-18',
        timezone: 'Europe/Berlin',
        signal: expect.any(AbortSignal),
      });
      expect(calls[0].files).toEqual([
        { mimeType: 'image/jpeg', bytes: first.bytes },
        { mimeType: 'image/jpeg', bytes: second.bytes },
      ]);
    });

    it('adds schemaVersion to what the model returns', async () => {
      const { provider } = recordingProvider();
      // The contract fixture quotes page 4.
      const files = Array.from({ length: 4 }, () => jpeg());
      const response = await handleAnalyze(analyzeRequest({ files }), deps({ provider }));

      expect((await response.json()).analysis).toEqual(ANALYSIS_FIXTURES.contract);
    });

    it('post-processes the answer with the request date and the page count (SPEC §7.4)', async () => {
      const { contract } = ANALYSIS_FIXTURES;
      const { provider } = recordingProvider(async () => {
        const model = validResult();
        const [cancellation, renewal] = model.deadlines;
        return {
          ...model,
          summary: `  ${contract.summary}  `,
          deadlines: [
            { ...cancellation, rule: { ...cancellation.rule!, fromDate: '2040-01-31' } },
            renewal,
          ],
        };
      });

      const response = await handleAnalyze(analyzeRequest(), deps({ provider }));

      expect(response.status).toBe(200);
      const { analysis } = await response.json();
      expect(analysis.summary).toBe(contract.summary);
      // Counted by its rule, three months before 2040-01-31 is more than 10 years after `today`:
      // dropped, and its action loses the link. The other deadline becomes d1, and its page 3 isn't
      // in a one-page upload.
      expect(analysis.deadlines).toEqual([{ ...contract.deadlines[1], id: 'd1', page: null }]);
      expect(analysis.actions).toEqual([{ ...contract.actions[0], deadlineId: null }]);
    });

    it('serves the minimum app version and newer ones', async () => {
      for (const version of ['1.2.0', '1.10.0', '2.0.0']) {
        const response = await handleAnalyze(
          analyzeRequest({ headers: { [API_HEADERS.appVersion]: version } }),
          deps({ minAppVersion: [1, 2, 0] })
        );
        expect(response.status).toBe(200);
      }
    });
  });

  describe('400 invalid_request', () => {
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
      ['no device id', { headers: { [API_HEADERS.deviceId]: undefined } }],
      ['a device id that is not a UUID', { headers: { [API_HEADERS.deviceId]: 'device-1' } }],
      ['an unknown platform', { headers: { [API_HEADERS.platform]: 'windows' } }],
      ['no app version', { headers: { [API_HEADERS.appVersion]: undefined } }],
      ['an app version that is not semver', { headers: { [API_HEADERS.appVersion]: '1.0' } }],
    ])('for %s', async (_label, options) => {
      const { provider, calls } = recordingProvider();

      const response = await handleAnalyze(analyzeRequest(options), deps({ provider }));

      await expectError(response, 400, 'invalid_request');
      expect(calls).toHaveLength(0);
    });

    it('for a body that is not multipart', async () => {
      const request = new Request(TEST_URL, {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: [] }),
      });

      await expectError(await handleAnalyze(request, deps()), 400, 'invalid_request');
    });

    it('for a multipart body that is cut off', async () => {
      const request = new Request(TEST_URL, {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'Content-Type': 'multipart/form-data; boundary=xyz' },
        body: '--xyz\r\nContent-Disposition: form-data; name="locale"\r\n\r\nru',
      });

      await expectError(await handleAnalyze(request, deps()), 400, 'invalid_request');
    });
  });

  describe('413 too_large', () => {
    it('for more than 30 images', async () => {
      const files = Array.from({ length: 31 }, () => jpeg(16));
      await expectError(await handleAnalyze(analyzeRequest({ files }), deps()), 413, 'too_large');
    });

    it('for a PDF with more than 30 pages', async () => {
      const files = [pdf(minimalPdf({ pages: 31 }))];
      await expectError(await handleAnalyze(analyzeRequest({ files }), deps()), 413, 'too_large');
    });

    it('for files over the size limit', async () => {
      const files = [jpeg(MAX_DOCUMENT_BYTES - 100), jpeg(200)];
      await expectError(await handleAnalyze(analyzeRequest({ files }), deps()), 413, 'too_large');
    });

    it('for a declared Content-Length over the limit, without reading the body', async () => {
      const request = new Request(TEST_URL, {
        method: 'POST',
        headers: {
          ...CLIENT_HEADERS,
          'Content-Type': 'multipart/form-data; boundary=xyz',
          'Content-Length': String(MAX_DOCUMENT_BYTES * 2),
        },
        body: 'never read',
      });
      const read = jest.spyOn(request, 'formData');

      await expectError(await handleAnalyze(request, deps()), 413, 'too_large');
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
      const request = new Request(TEST_URL, {
        method: 'POST',
        headers: { ...CLIENT_HEADERS, 'Content-Type': 'multipart/form-data; boundary=xyz' },
        body,
        duplex: 'half',
      } as RequestInit);

      await expectError(await handleAnalyze(request, deps()), 413, 'too_large');
      expect(sent).toBeLessThan(MAX_DOCUMENT_BYTES * 1.2);
    });
  });

  describe('422', () => {
    it('encrypted_pdf for a PDF with a password', async () => {
      const files = [pdf(minimalPdf({ encrypted: true }))];
      await expectError(
        await handleAnalyze(analyzeRequest({ files }), deps()),
        422,
        'encrypted_pdf'
      );
    });

    it('invalid_pdf for a damaged PDF', async () => {
      const files = [pdf(new TextEncoder().encode('%PDF-1.7\nnot really'))];
      await expectError(await handleAnalyze(analyzeRequest({ files }), deps()), 422, 'invalid_pdf');
    });

    it('invalid_pdf for a file that only says it is a PDF', async () => {
      const files = [pdf(jpeg().bytes)];
      await expectError(await handleAnalyze(analyzeRequest({ files }), deps()), 422, 'invalid_pdf');
    });
  });

  it('426 upgrade_required for an app below the minimum version, before reading the body', async () => {
    const request = analyzeRequest({ headers: { [API_HEADERS.appVersion]: '1.1.9' } });

    const response = await handleAnalyze(request, deps({ minAppVersion: [1, 2, 0] }));

    await expectError(response, 426, 'upgrade_required');
    expect(request.bodyUsed).toBe(false);
  });

  it('502 analysis_failed when the model returns an invalid analysis', async () => {
    const { provider } = recordingProvider(async () => ({ ...validResult(), summary: 42 }));

    await expectError(
      await handleAnalyze(analyzeRequest(), deps({ provider })),
      502,
      'analysis_failed'
    );
  });

  it('503 unavailable when the provider fails', async () => {
    const { provider } = recordingProvider(async () => {
      throw new Error('connection refused');
    });

    await expectError(
      await handleAnalyze(analyzeRequest(), deps({ provider })),
      503,
      'unavailable'
    );
  });

  it('rethrows when the client is gone, instead of answering', async () => {
    const controller = new AbortController();
    const source = analyzeRequest();
    const request = new Request(source, { signal: controller.signal });
    const provider: LlmProvider = {
      id: 'aborted',
      analyze: async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
    };

    await expect(handleAnalyze(request, deps({ provider }))).rejects.toThrow('Aborted');
  });

  it('holds no reference to the files while the model works', async () => {
    let handed: LlmAnalyzeInput['files'] = [];
    const provider: LlmProvider = {
      id: 'owner',
      analyze: async (input) => {
        handed = input.files;
        // A real provider encodes the files and empties the array it was given.
        input.files.splice(0);
        return { result: validResult(), usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
      },
    };

    const response = await handleAnalyze(
      analyzeRequest({ files: [jpeg(), jpeg()] }),
      deps({ provider })
    );

    expect(response.status).toBe(200);
    expect(handed).toEqual([]);
    expect((await response.json()).pageCount).toBe(2);
  });
});

describe('handleAnalyze logs', () => {
  const ofType = (event: string) => events.filter((logged) => logged.event === event);

  beforeEach(() => {
    server = testServerDeps();
    events = server.events;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs a start and an end with metadata of the request', async () => {
    await handleAnalyze(analyzeRequest({ files: [jpeg(1000), jpeg(2000)] }), deps());

    expect(events.map((event) => event.event)).toEqual(['analyze.start', 'analyze.end']);
    const [start, end] = events;
    expect(start).toEqual({
      event: 'analyze.start',
      requestId: expect.any(String),
      device: expect.stringMatching(/^[0-9a-f]{16}$/),
      platform: 'android',
      appVersion: '1.0.0',
      bodyBytes: null,
    });
    expect(end).toEqual({
      event: 'analyze.end',
      requestId: start.requestId,
      status: 200,
      code: 'ok',
      error: null,
      ms: expect.any(Number),
      platform: 'android',
      appVersion: '1.0.0',
      kind: 'images',
      pages: 2,
      bytes: 3000,
      locale: 'ru',
      provider: 'mock',
      modelMs: expect.any(Number),
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      deadlines: 1,
      fraudSignals: 0,
      readable: true,
    });
  });

  it('uses the Cf-Ray id, which the EAS dashboard looks requests up by', async () => {
    await handleAnalyze(analyzeRequest({ headers: { 'Cf-Ray': '8f1d2c3b4a5e6f70-FRA' } }), deps());

    expect(events.map((event) => event.requestId)).toEqual([
      '8f1d2c3b4a5e6f70-FRA',
      '8f1d2c3b4a5e6f70-FRA',
    ]);
  });

  it('logs only the end when the client headers are wrong', async () => {
    await handleAnalyze(analyzeRequest({ headers: { [API_HEADERS.deviceId]: 'x' } }), deps());

    expect(events).toEqual([
      expect.objectContaining({ event: 'analyze.end', status: 400, code: 'invalid_request' }),
    ]);
    expect(events[0]).toMatchObject({ platform: null, kind: null });
  });

  it('logs how far a rejected upload got', async () => {
    await handleAnalyze(analyzeRequest({ files: [pdf(minimalPdf({ encrypted: true }))] }), deps());

    expect(ofType('analyze.end')[0]).toMatchObject({
      status: 422,
      code: 'encrypted_pdf',
      kind: 'pdf',
      pages: null,
      modelMs: null,
    });
  });

  it('logs an invalid model answer without what the model said', async () => {
    const { provider } = recordingProvider(async () => ({ ...validResult(), summary: 42 }));

    await handleAnalyze(analyzeRequest(), deps({ provider }));

    expect(ofType('analyze.end')[0]).toMatchObject({
      status: 502,
      code: 'analysis_failed',
      modelMs: expect.any(Number),
      deadlines: null,
    });
  });

  it('leaves an interrupted analysis without an end (SPEC §8.7)', async () => {
    const controller = new AbortController();
    const request = new Request(analyzeRequest(), { signal: controller.signal });
    const provider: LlmProvider = {
      id: 'aborted',
      analyze: async () => {
        controller.abort();
        throw new DOMException('Aborted', 'AbortError');
      },
    };

    await expect(handleAnalyze(request, deps({ provider }))).rejects.toThrow();
    expect(events.map((event) => event.event)).toEqual(['analyze.start']);
  });

  it('rethrows an unexpected error without its message, which can quote content', async () => {
    jest
      .spyOn(inspectPdfModule, 'inspectPdf')
      .mockRejectedValue(new SyntaxError('Unexpected token in "Счёт за электричество"'));

    const failure = handleAnalyze(analyzeRequest({ files: [pdf(minimalPdf())] }), deps());

    await expect(failure).rejects.toMatchObject({
      name: 'SyntaxError',
      message: '[message redacted]',
      stack: expect.not.stringContaining('Счёт'),
    });
    expect(ofType('analyze.end')[0]).toMatchObject({
      status: 500,
      code: 'internal',
      error: 'SyntaxError',
    });
  });

  it('never logs the document or its analysis (SPEC §7.1)', async () => {
    const { fraudulentInvoice } = ANALYSIS_FIXTURES;
    const content = stringsIn(fraudulentInvoice).filter((text) => text.length >= 4);
    const fileName = 'Паспорт Иванова.jpg';

    await handleAnalyze(
      analyzeRequest({ files: [{ ...jpeg(), name: fileName }] }),
      deps({ provider: new MockLlmProvider({ fixture: 'fraudulentInvoice' }) })
    );
    await handleAnalyze(
      analyzeRequest({ files: [{ ...jpeg(), name: fileName }] }),
      deps({
        provider: recordingProvider(async () => ({ ...validResult(), summary: 42 })).provider,
      })
    );

    const logged = JSON.stringify(events);
    expect(ofType('analyze.end')).toHaveLength(2);
    expect(content.length).toBeGreaterThan(10);
    for (const text of [...content, fileName, CLIENT_HEADERS[API_HEADERS.deviceId]]) {
      expect(logged).not.toContain(text);
    }
  });
});

function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsIn);
  return [];
}

describe('handleAnalyze limits (SPEC §8.3)', () => {
  beforeEach(() => {
    server = testServerDeps();
    events = server.events;
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  const fromDevice = (deviceId: string, ip = '203.0.113.7') =>
    analyzeRequest({ headers: { [API_HEADERS.deviceId]: deviceId, 'X-Real-IP': ip } });

  it('answers 429 with Retry-After once the device used its analyses, before reading the body', async () => {
    for (let i = 0; i < 10; i++) {
      expect((await handleAnalyze(analyzeRequest(), deps())).status).toBe(200);
    }
    const { provider, calls } = recordingProvider();
    const request = analyzeRequest();

    const response = await handleAnalyze(request, deps({ provider }));

    await expectError(response, 429, 'rate_limited');
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
    expect(request.bodyUsed).toBe(false);
    expect(calls).toHaveLength(0);
    expect(events.at(-1)).toMatchObject({ event: 'analyze.end', status: 429, kind: null });
  });

  it('charges only analyses the device got', async () => {
    server = testServerDeps({ limits: { devicePerDay: 1 } });
    const encrypted = { files: [pdf(minimalPdf({ encrypted: true }))] };
    for (let i = 0; i < 3; i++) {
      expect((await handleAnalyze(analyzeRequest(encrypted), deps())).status).toBe(422);
    }
    const { provider } = recordingProvider(async () => ({ summary: 42 }));
    expect((await handleAnalyze(analyzeRequest(), deps({ provider }))).status).toBe(502);

    expect((await handleAnalyze(analyzeRequest(), deps())).status).toBe(200);
    expect((await handleAnalyze(analyzeRequest(), deps())).status).toBe(429);
  });

  it('limits attempts from one IP address whatever the device id says', async () => {
    server = testServerDeps({ limits: { ipPerHour: 2 } });

    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await handleAnalyze(fromDevice(crypto.randomUUID()), deps())).status);
    }
    const otherNetwork = await handleAnalyze(
      fromDevice(crypto.randomUUID(), '198.51.100.1'),
      deps()
    );

    expect(statuses).toEqual([200, 200, 429]);
    expect(otherNetwork.status).toBe(200);
  });

  it('answers 503 once the day’s budget is spent', async () => {
    server = testServerDeps({ limits: { dailyBudgetUsd: 1 } });
    const provider: LlmProvider = {
      id: 'pricey',
      analyze: async () => ({
        result: validResult(),
        usage: { inputTokens: 1, outputTokens: 1 },
        costUsd: 1,
      }),
    };

    expect((await handleAnalyze(analyzeRequest(), deps({ provider }))).status).toBe(200);
    const response = await handleAnalyze(fromDevice(crypto.randomUUID()), deps({ provider }));

    await expectError(response, 503, 'unavailable');
    expect(response.headers.get('Retry-After')).toBe(String(12 * 60 * 60));
  });

  it('still analyzes when the counter store is down', async () => {
    server = testServerDeps({
      store: {
        run: async () => {
          throw new StoreUnavailableError('down');
        },
      },
    });
    events = server.events;

    const response = await handleAnalyze(analyzeRequest(), deps());

    expect(response.status).toBe(200);
    expect(events.filter((event) => event.event === 'limits.unavailable')).toHaveLength(2);
  });

  it('counts the beta metrics of the request', async () => {
    await handleAnalyze(analyzeRequest(), deps());
    await handleAnalyze(analyzeRequest({ files: [pdf(minimalPdf({ encrypted: true }))] }), deps());

    const [today] = await readBetaReport(server.store, server.now(), 1);

    expect(today).toMatchObject({
      started: 2,
      ended: 2,
      interrupted: 0,
      withDeadline: 1,
      devices: 1,
      outcomes: expect.objectContaining({ ok: 1, encrypted_pdf: 1 }),
    });
  });
});
