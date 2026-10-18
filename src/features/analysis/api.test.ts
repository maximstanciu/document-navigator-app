import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { isOnline } from '@/lib/network';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { localCalendarDate } from '@/shared/calendar-date';
import { fakeFileSystem } from '@/test/fake-file-system';
import { installTestRepositories } from '@/test/sqlite';

import { ANALYZE_TIMEOUT_MS, analyzeDocument } from './api';
import { AnalysisError } from './errors';
import { keepScreenAwake } from './keep-awake';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('@/lib/network', () => ({ isOnline: jest.fn() }));
jest.mock('@/lib/api/client-headers', () => ({
  getClientHeaders: async () => ({
    'X-Device-Id': '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    'X-App-Version': '1.0.0',
    'X-Platform': 'android',
  }),
}));
jest.mock('./keep-awake', () => ({ keepScreenAwake: jest.fn() }));
// Jest's FormData is Node's, which wants bytes rather than React Native's `{ uri, name, type }`.
jest.mock('./upload-file', () => ({
  appendUploadFile: async (
    form: FormData,
    field: string,
    file: { uri: string; name: string; type: string }
  ) => form.append(field, new Blob([file.uri], { type: file.type }), file.name),
}));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

const online = jest.mocked(isOnline);
const keepAwake = jest.mocked(keepScreenAwake);
const releaseAwake = jest.fn();

let repositories: Repositories;
let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

const ROOT = fakeFileSystem.documentRoot;

/** A draft as the review screen saves it (CAP-5): page rows and their files on disk. */
async function seedDraft(
  id = 'doc-1',
  { pdf = false, pageCount = pdf ? 1 : 2 }: { pdf?: boolean; pageCount?: number } = {}
) {
  const pages = Array.from({ length: pageCount }, (_, index) => ({
    id: `${id}-p${index + 1}`,
    relativePath: `documents/${id}/${id}-p${index + 1}.${pdf ? 'pdf' : 'jpg'}`,
    width: pdf ? null : 1448,
    height: pdf ? null : 2048,
  }));
  for (const page of pages) fakeFileSystem.addFile(`${ROOT}/${page.relativePath}`);
  await repositories.documents.create(
    {
      id,
      title: '',
      source: pdf ? 'file' : 'scan',
      mimeType: pdf ? 'application/pdf' : 'image/jpeg',
      pageCount: pdf ? null : pageCount,
      fileSize: 800_000,
    },
    pages
  );
}

function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const errorBody = (code: string) => ({ error: { code, message: 'Server text' } });

/** The analysis server answers every request with what `respond` returns. */
function serverAnswers(respond: () => Response | Promise<Response>) {
  fetchSpy.mockImplementation(async () => respond());
}

/** A server that never answers; the request ends only when it's aborted, as with `fetch`. */
function serverHangs(onRequest?: () => void) {
  fetchSpy.mockImplementation(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        onRequest?.();
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError'))
        );
      })
  );
}

function sentForm(): FormData {
  return fetchSpy.mock.calls[0][1]?.body as FormData;
}

async function failureOf(promise: Promise<unknown>): Promise<AnalysisError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AnalysisError);
  return error as AnalysisError;
}

beforeEach(async () => {
  mockUuidCounter = 0;
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  online.mockResolvedValue(true);
  keepAwake.mockReturnValue(releaseAwake);
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
  jest.useRealTimers();
  releaseAwake.mockClear();
  keepAwake.mockClear();
});

describe('analyzeDocument (task 4.1)', () => {
  it('sends the pages and stores the analysis, its deadlines and actions (ANL-1, ANL-2)', async () => {
    await seedDraft();
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));

    await analyzeDocument('doc-1');

    const document = await repositories.documents.get('doc-1');
    expect(document).toMatchObject({
      status: 'ready',
      errorCode: null,
      title: 'Счёт за электричество, сентябрь 2026',
      senderName: 'Stadtwerke Musterstadt GmbH',
      pageCount: 2,
      analysis: ANALYSIS_FIXTURES.invoice,
      analysisLocale: 'en',
    });
    expect(document?.searchText).toContain('stadtwerke musterstadt gmbh');
    const [deadline] = await repositories.deadlines.list({ documentId: 'doc-1' });
    expect(deadline).toMatchObject({ kind: 'payment', dueDate: '2026-10-31', status: 'open' });
    expect(await repositories.actions.listByDocument('doc-1')).toMatchObject([
      { deadlineId: deadline.id, priority: 'high', done: false },
    ]);
  });

  it('posts multipart with the pages in order, the locale, the date and the time zone (SPEC §7.2)', async () => {
    await seedDraft('doc-1', { pageCount: 2 });
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));

    await analyzeDocument('doc-1');

    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('/api/v1/analyze');
    expect(init).toMatchObject({ method: 'POST', headers: { 'X-Platform': 'android' } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const form = sentForm();
    const files = form.getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['page-1.jpg', 'image/jpeg'],
      ['page-2.jpg', 'image/jpeg'],
    ]);
    expect(await files[0].text()).toBe(`${ROOT}/documents/doc-1/doc-1-p1.jpg`);
    expect(form.get('locale')).toBe('en');
    expect(form.get('today')).toBe(localCalendarDate(new Date()));
    expect(form.get('timezone')).toBe('America/New_York');
  });

  it('explains in the language chosen in settings (D-5)', async () => {
    await repositories.settings.update({ explanationLocale: 'ru' });
    await seedDraft();
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));

    await analyzeDocument('doc-1');

    expect(sentForm().get('locale')).toBe('ru');
    expect(await repositories.documents.get('doc-1')).toMatchObject({ analysisLocale: 'ru' });
  });

  it('sends a PDF as one file and takes its page count from the server (D-4)', async () => {
    await seedDraft('doc-1', { pdf: true });
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.contract, pageCount: 7 }));

    await analyzeDocument('doc-1');

    const files = sentForm().getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['document.pdf', 'application/pdf'],
    ]);
    expect(await repositories.documents.get('doc-1')).toMatchObject({ pageCount: 7 });
  });

  it('marks the document analyzing first and keeps the screen on until the end (ANL-3, D-1)', async () => {
    await seedDraft();
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));
    const statusWhenStarted = jest.fn(async () => {
      const document = await repositories.documents.get('doc-1');
      return document?.status;
    });

    await analyzeDocument('doc-1', statusWhenStarted);

    await expect(statusWhenStarted.mock.results[0].value).resolves.toBe('analyzing');
    expect(keepAwake).toHaveBeenCalledWith('analysis-doc-1');
    expect(releaseAwake).toHaveBeenCalledTimes(1);
  });

  it.each([
    [413, 'too_large'],
    [426, 'upgrade_required'],
    [422, 'encrypted_pdf'],
    [502, 'analysis_failed'],
    [503, 'unavailable'],
  ])('fails the document on %s with the server code %s (ANL-9)', async (status, code) => {
    await seedDraft();
    serverAnswers(() => json(status, errorBody(code)));

    const failure = await failureOf(analyzeDocument('doc-1'));

    expect(failure.code).toBe(code);
    expect(await repositories.documents.get('doc-1')).toMatchObject({
      status: 'failed',
      errorCode: code,
    });
    expect(releaseAwake).toHaveBeenCalledTimes(1);
  });

  it('keeps when a 429 lets the person try again (ANL-9)', async () => {
    await seedDraft();
    serverAnswers(() => json(429, errorBody('rate_limited'), { 'Retry-After': '600' }));
    const before = Date.now();

    const failure = await failureOf(analyzeDocument('doc-1'));

    expect(failure.code).toBe('rate_limited');
    expect(failure.retryAt!.getTime()).toBeGreaterThanOrEqual(before + 600_000);
    expect(await repositories.documents.get('doc-1')).toMatchObject({ errorCode: 'rate_limited' });
  });

  it('reads a 5xx without our body as unavailable (SPEC §7.2)', async () => {
    await seedDraft();
    serverAnswers(() => new Response('CPU time limit exceeded', { status: 504 }));

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('unavailable');
  });

  it('fails as network when the request breaks off', async () => {
    await seedDraft();
    fetchSpy.mockRejectedValue(new TypeError('Network request failed'));

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('network');
    expect(await repositories.documents.get('doc-1')).toMatchObject({
      status: 'failed',
      errorCode: 'network',
    });
  });

  it('gives up after 90 seconds without an answer (timeout)', async () => {
    jest.useFakeTimers();
    await seedDraft();
    let requestSent!: () => void;
    const sent = new Promise<void>((resolve) => (requestSent = resolve));
    serverHangs(() => requestSent());

    const analysis = analyzeDocument('doc-1');
    await sent;
    jest.advanceTimersByTime(ANALYZE_TIMEOUT_MS);

    expect((await failureOf(analysis)).code).toBe('timeout');
    expect(await repositories.documents.get('doc-1')).toMatchObject({ errorCode: 'timeout' });
  });

  it('does not send anything without a network and keeps the pages (ANL-10)', async () => {
    await seedDraft();
    online.mockResolvedValue(false);

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('offline');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await repositories.documents.get('doc-1')).toMatchObject({
      status: 'failed',
      errorCode: 'offline',
    });
    expect(await repositories.pages.listByDocument('doc-1')).toHaveLength(2);
  });

  it('fails as interrupted after the app was closed mid-analysis, and can be retried (ANL-4)', async () => {
    jest.useFakeTimers();
    await seedDraft();
    let requestSent!: () => void;
    const sent = new Promise<void>((resolve) => (requestSent = resolve));
    serverHangs(() => requestSent());
    const killed = analyzeDocument('doc-1').catch(() => {});
    await sent;
    // The app is killed here; on the next start the database is opened again.

    await repositories.documents.failInterruptedAnalyses();

    expect(await repositories.documents.get('doc-1')).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
    });
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));
    await analyzeDocument('doc-1');
    expect(await repositories.documents.get('doc-1')).toMatchObject({ status: 'ready' });

    // The killed request's timer would otherwise keep Jest waiting for 90 s.
    jest.runOnlyPendingTimers();
    await killed;
  });

  it('fails as files_missing when a page file is gone, without sending (STO-8)', async () => {
    await seedDraft();
    fakeFileSystem.reset();

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('files_missing');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails as analysis_failed when the answer is not a valid analysis', async () => {
    await seedDraft();
    serverAnswers(() =>
      json(200, { analysis: { ...ANALYSIS_FIXTURES.invoice, deadlines: 'none' }, pageCount: 2 })
    );

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('analysis_failed');
  });

  it('drops the result of a document deleted during the analysis', async () => {
    await seedDraft();
    serverAnswers(async () => {
      await repositories.documents.remove('doc-1');
      return json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 });
    });

    await analyzeDocument('doc-1');

    expect(await repositories.documents.get('doc-1')).toBeNull();
    expect(await repositories.deadlines.list({ documentId: 'doc-1' })).toEqual([]);
  });

  it('does not start a second analysis of a document that is being analyzed', async () => {
    jest.useFakeTimers();
    await seedDraft();
    let requestSent!: () => void;
    const sent = new Promise<void>((resolve) => (requestSent = resolve));
    serverHangs(() => requestSent());
    const first = analyzeDocument('doc-1').catch(() => {});
    await sent;

    await expect(analyzeDocument('doc-1')).rejects.toThrow("can't be analyzed now");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(await repositories.documents.get('doc-1')).toMatchObject({ status: 'analyzing' });

    jest.runOnlyPendingTimers();
    await first;
  });

  it('fails as interrupted when the result can not be stored', async () => {
    await seedDraft();
    serverAnswers(() => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 2 }));
    jest
      .spyOn(repositories.documents, 'saveAnalysis')
      .mockRejectedValueOnce(new Error('disk I/O error'));

    await expect(analyzeDocument('doc-1')).rejects.toThrow('disk I/O error');

    expect(await repositories.documents.get('doc-1')).toMatchObject({
      status: 'failed',
      errorCode: 'interrupted',
    });
  });
});
