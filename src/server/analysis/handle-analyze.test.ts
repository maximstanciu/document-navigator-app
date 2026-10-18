/** @jest-environment node */
import { ANALYZE_FIELDS, analyzeResponseSchema } from '@/shared/analysis/contract';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
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
import { handleAnalyze, type AnalyzeDeps } from './handle-analyze';
import type { LlmAnalyzeInput, LlmProvider } from './llm-provider';
import { MockLlmProvider } from './providers/mock-llm-provider';

function deps(overrides: Partial<AnalyzeDeps> = {}): AnalyzeDeps {
  return { provider: new MockLlmProvider(), minAppVersion: null, ...overrides };
}

/** A provider that records what it got and answers with `result`. */
function recordingProvider(answer: () => Promise<unknown> = async () => validResult()) {
  const calls: LlmAnalyzeInput[] = [];
  const provider: LlmProvider = {
    id: 'recording',
    analyze: async (input) => {
      calls.push({ ...input, files: [...input.files] });
      return { result: await answer(), usage: { inputTokens: 1, outputTokens: 1 } };
    },
  };
  return { provider, calls };
}

function validResult() {
  const { schemaVersion: _schemaVersion, ...result } = ANALYSIS_FIXTURES.contract;
  return result;
}

async function expectError(response: Response, status: number, code: string) {
  expect(response.status).toBe(status);
  expect(response.headers.get('Content-Type')).toMatch(/application\/json/);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

describe('handleAnalyze', () => {
  beforeEach(() => {
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
      const response = await handleAnalyze(analyzeRequest(), deps({ provider }));

      expect((await response.json()).analysis).toEqual(ANALYSIS_FIXTURES.contract);
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
        return { result: validResult(), usage: { inputTokens: 0, outputTokens: 0 } };
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
