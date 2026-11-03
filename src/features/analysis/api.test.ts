import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { isOnline } from '@/lib/network';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { localCalendarDate } from '@/shared/calendar-date';
import { fakeFileSystem } from '@/test/fake-file-system';
import { fakeNotifications, requestNotificationPermission } from '@/test/fake-notifications';
import { installTestRepositories } from '@/test/sqlite';

import {
  analyzeDocument,
  cancelAnalysis,
  checkAnalysisJobs,
  deleteAllAnalysisJobs,
  forgetDocumentAnalysis,
  sendJobDeletions,
  sendPushTokenToJobs,
  turnOnAnalysisPush,
  UPLOAD_TIMEOUT_MS,
} from './api';
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
/** The first id `randomUUID()` gives in a test: the job of the first analysis. */
const FIRST_JOB = 'uuid-1';

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
const queued = (ahead = 0) => json(202, { status: 'queued', ahead });
const done = (analysis = ANALYSIS_FIXTURES.invoice, pageCount = 2) =>
  json(200, { status: 'done', analysis, pageCount });
const noContent = () => new Response(null, { status: 204 });

type Respond = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;

/**
 * The analysis server: each method answers with what its handler returns. `DELETE` answers `204`
 * unless told otherwise; a method without a handler fails the test.
 */
const server: Partial<Record<'PUT' | 'GET' | 'PATCH' | 'DELETE', Respond>> = {};

function requests(method?: string) {
  return fetchSpy.mock.calls
    .map(([url, init]) => ({ method: init?.method ?? 'GET', url: String(url), init }))
    .filter((request) => !method || request.method === method);
}

/** A response that never comes; the request ends only when it's aborted, as with `fetch`. */
function hang(onRequest?: () => void): Respond {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      onRequest?.();
      init?.signal?.addEventListener('abort', () =>
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      );
    });
}

/** Makes the upload hang and resolves once it was sent. */
function uploadHangs(): Promise<void> {
  return new Promise((resolve) => (server.PUT = hang(resolve)));
}

function sentForm(): FormData {
  return requests('PUT')[0].init?.body as FormData;
}

async function failureOf(promise: Promise<unknown>): Promise<AnalysisError> {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(AnalysisError);
  return error as AnalysisError;
}

const documentOf = (id = 'doc-1') => repositories.documents.get(id);

beforeEach(async () => {
  mockUuidCounter = 0;
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  online.mockResolvedValue(true);
  keepAwake.mockReturnValue(releaseAwake);
  for (const method of ['PUT', 'GET', 'PATCH', 'DELETE'] as const) delete server[method];
  server.DELETE = noContent;
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const method = (init?.method ?? 'GET') as keyof typeof server;
    const respond = server[method];
    if (!respond) throw new Error(`Unexpected ${method} ${String(url)}`);
    return respond(String(url), init);
  });
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
  jest.useRealTimers();
  releaseAwake.mockClear();
  keepAwake.mockClear();
});

describe('analyzeDocument: the upload (task 4.8)', () => {
  it('uploads the pages as a job and leaves the document analyzing under it (ANL-1, ANL-3)', async () => {
    await seedDraft();
    server.PUT = () => queued(2);

    await analyzeDocument('doc-1');

    expect(await documentOf()).toMatchObject({
      status: 'analyzing',
      errorCode: null,
      analysisJobId: FIRST_JOB,
      analysis: null,
    });
    expect(requests().map(({ method, url }) => `${method} ${url}`)).toEqual([
      `PUT /api/v1/analyses/${FIRST_JOB}`,
    ]);
  });

  it('puts multipart with the pages in order, the locales, the date and the time zone (SPEC §7.2)', async () => {
    await seedDraft('doc-1', { pageCount: 2 });
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    const [{ init }] = requests('PUT');
    expect(init).toMatchObject({ headers: { 'X-Platform': 'android' } });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const form = sentForm();
    const files = form.getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['page-1.jpg', 'image/jpeg'],
      ['page-2.jpg', 'image/jpeg'],
    ]);
    expect(await files[0].text()).toBe(`${ROOT}/documents/doc-1/doc-1-p1.jpg`);
    expect(form.get('locale')).toBe('en');
    expect(form.get('uiLocale')).toBe('en');
    expect(form.get('today')).toBe(localCalendarDate(new Date()));
    expect(form.get('timezone')).toBe('America/New_York');
    expect(form.get('pushToken')).toBeNull();
  });

  it('explains in the language chosen in settings and stores the result in it (D-5)', async () => {
    await repositories.settings.update({ explanationLocale: 'ru' });
    await seedDraft();
    server.PUT = () => queued();
    await analyzeDocument('doc-1');
    // The language changes while the job waits: the result is in the one it asked for.
    await repositories.settings.update({ explanationLocale: 'en' });
    server.GET = () => done();

    await checkAnalysisJobs();

    expect(sentForm().get('locale')).toBe('ru');
    expect(await documentOf()).toMatchObject({ status: 'ready', analysisLocale: 'ru' });
  });

  it('sends a PDF as one file (D-4)', async () => {
    await seedDraft('doc-1', { pdf: true });
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    const files = sentForm().getAll('files') as File[];
    expect(files.map((file) => [file.name, file.type])).toEqual([
      ['document.pdf', 'application/pdf'],
    ]);
  });

  it('marks the document analyzing first and keeps the screen on only while it uploads (ANL-3)', async () => {
    await seedDraft();
    server.PUT = () => queued();
    const statusWhenStarted = jest.fn(async () => (await documentOf())?.status);

    await analyzeDocument('doc-1', statusWhenStarted);

    await expect(statusWhenStarted.mock.results[0].value).resolves.toBe('analyzing');
    expect(keepAwake).toHaveBeenCalledWith('analysis-doc-1');
    expect(releaseAwake).toHaveBeenCalledTimes(1);
  });

  it.each([
    [413, 'too_large'],
    [426, 'upgrade_required'],
    [422, 'encrypted_pdf'],
    [429, 'too_many_jobs'],
    [503, 'unavailable'],
  ])('fails the document on %s with the server code %s (ANL-9)', async (status, code) => {
    await seedDraft();
    server.PUT = () => json(status, errorBody(code));

    const failure = await failureOf(analyzeDocument('doc-1'));

    expect(failure.code).toBe(code);
    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: code });
    expect(releaseAwake).toHaveBeenCalledTimes(1);
  });

  it('keeps when a 429 lets the person try again (ANL-9)', async () => {
    await seedDraft();
    server.PUT = () => json(429, errorBody('rate_limited'), { 'Retry-After': '600' });
    const before = Date.now();

    const failure = await failureOf(analyzeDocument('doc-1'));

    expect(failure.code).toBe('rate_limited');
    expect(failure.retryAt!.getTime()).toBeGreaterThanOrEqual(before + 600_000);
    expect(await documentOf()).toMatchObject({ errorCode: 'rate_limited' });
  });

  it('reads a 5xx without our body as unavailable (SPEC §7.2)', async () => {
    await seedDraft();
    server.PUT = () => new Response('Bad Gateway', { status: 502 });

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('unavailable');
  });

  it('fails as network when the upload breaks off', async () => {
    await seedDraft();
    server.PUT = () => Promise.reject(new TypeError('Network request failed'));

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('network');
    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'network' });
  });

  it('gives up on an upload after 5 minutes without an answer (timeout)', async () => {
    jest.useFakeTimers();
    await seedDraft();
    const sent = uploadHangs();

    const analysis = analyzeDocument('doc-1');
    await sent;
    jest.advanceTimersByTime(UPLOAD_TIMEOUT_MS);

    expect((await failureOf(analysis)).code).toBe('timeout');
    expect(await documentOf()).toMatchObject({ errorCode: 'timeout' });
  });

  it('uploads again under the same job after network or timeout, so no second job starts (ANL-9)', async () => {
    await seedDraft();
    server.PUT = () => Promise.reject(new TypeError('Network request failed'));
    await failureOf(analyzeDocument('doc-1'));
    // The first upload did get through: the server answers with that job.
    server.PUT = () => json(202, { status: 'processing' });

    await analyzeDocument('doc-1');

    expect(requests('PUT').map(({ url }) => url)).toEqual([
      `/api/v1/analyses/${FIRST_JOB}`,
      `/api/v1/analyses/${FIRST_JOB}`,
    ]);
    expect(await documentOf()).toMatchObject({ status: 'analyzing', analysisJobId: FIRST_JOB });
  });

  it('starts a new job after any other failure', async () => {
    await seedDraft();
    server.PUT = () => json(503, errorBody('unavailable'));
    await failureOf(analyzeDocument('doc-1'));
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    const [first, second] = requests('PUT').map(({ url }) => url);
    expect(second).not.toBe(first);
  });

  it('stores at once a job the repeated upload finds done', async () => {
    await seedDraft();
    server.PUT = () => done();

    await analyzeDocument('doc-1');

    expect(await documentOf()).toMatchObject({ status: 'ready' });
    expect(await repositories.analysisJobDeletions.list()).toEqual([FIRST_JOB]);
  });

  it('does not send anything without a network and keeps the pages (ANL-10)', async () => {
    await seedDraft();
    online.mockResolvedValue(false);

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('offline');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'offline' });
    expect(await repositories.pages.listByDocument('doc-1')).toHaveLength(2);
  });

  it('uploads nothing while three other documents are being analyzed (ANL-3, SPEC §8.3)', async () => {
    server.PUT = () => queued();
    for (const id of ['a', 'b', 'c']) {
      await seedDraft(id);
      await analyzeDocument(id);
    }
    await seedDraft('doc-1');

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('too_many_jobs');
    expect(requests('PUT')).toHaveLength(3);
  });

  it('fails as files_missing when a page file is gone, without sending (STO-8)', async () => {
    await seedDraft();
    fakeFileSystem.reset();

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('files_missing');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fails as analysis_failed when the answer is not a job state, and drops the job', async () => {
    await seedDraft();
    server.PUT = () => json(202, { status: 'waiting' });

    expect((await failureOf(analyzeDocument('doc-1'))).code).toBe('analysis_failed');
    expect(await repositories.analysisJobDeletions.list()).toEqual([FIRST_JOB]);
  });

  it('does not start a second analysis of a document that is being analyzed', async () => {
    await seedDraft();
    const sent = uploadHangs();
    const first = analyzeDocument('doc-1').catch(() => {});
    await sent;

    await expect(analyzeDocument('doc-1')).rejects.toThrow("can't be analyzed now");

    expect(requests('PUT')).toHaveLength(1);
    expect(await documentOf()).toMatchObject({ status: 'analyzing' });
    await cancelAnalysis('doc-1');
    await first;
  });
});

describe('checkAnalysisJobs: the polling (SPEC §7.2 «Опрос»)', () => {
  /** doc-1 uploaded: its job waits on the server. */
  async function uploaded(id = 'doc-1') {
    await seedDraft(id);
    server.PUT = () => queued();
    await analyzeDocument(id);
  }

  it('reports where a waiting job stands, and changes nothing', async () => {
    await uploaded();
    server.GET = () => json(200, { status: 'queued', ahead: 2 });

    await expect(checkAnalysisJobs()).resolves.toEqual({
      progress: { 'doc-1': { status: 'queued', ahead: 2 } },
      changed: false,
    });
    server.GET = () => json(200, { status: 'processing' });
    await expect(checkAnalysisJobs()).resolves.toMatchObject({
      progress: { 'doc-1': { status: 'processing' } },
    });

    expect(requests('GET').map(({ url }) => url)).toEqual([
      `/api/v1/analyses/${FIRST_JOB}`,
      `/api/v1/analyses/${FIRST_JOB}`,
    ]);
    expect(await documentOf()).toMatchObject({ status: 'analyzing' });
  });

  it('stores a done job with its deadlines and actions, then deletes the job (ANL-2)', async () => {
    await uploaded();
    server.GET = () => done(ANALYSIS_FIXTURES.invoice, 2);

    await expect(checkAnalysisJobs()).resolves.toEqual({ progress: {}, changed: true });

    const document = await documentOf();
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
    expect(requests('DELETE').map(({ url }) => url)).toEqual([`/api/v1/analyses/${FIRST_JOB}`]);
    expect(await repositories.analysisJobDeletions.list()).toEqual([]);
  });

  it('takes the page count of a PDF from the server (D-4)', async () => {
    await seedDraft('doc-1', { pdf: true });
    server.PUT = () => queued();
    await analyzeDocument('doc-1');
    server.GET = () => done(ANALYSIS_FIXTURES.contract, 7);

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'ready', pageCount: 7 });
  });

  it.each(['analysis_failed', 'unavailable'])(
    'fails the document with the code of a failed job (%s), and deletes the job',
    async (code) => {
      await uploaded();
      server.GET = () => json(200, { status: 'failed', error: { code, message: 'Model text' } });

      await expect(checkAnalysisJobs()).resolves.toEqual({ progress: {}, changed: true });

      expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: code });
      expect(requests('DELETE')).toHaveLength(1);
    }
  );

  it('fails a job the server does not know as interrupted (ANL-4)', async () => {
    await uploaded();
    server.GET = () => json(404, errorBody('job_not_found'));

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(requests('DELETE')).toEqual([]);
  });

  it('fails as analysis_failed on a state that is not one, and deletes the job', async () => {
    await uploaded();
    server.GET = () => json(200, { status: 'done', analysis: { title: 'Broken' }, pageCount: 1 });

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'analysis_failed' });
    expect(requests('DELETE')).toHaveLength(1);
  });

  it('fails as upgrade_required when the server no longer takes this version', async () => {
    await uploaded();
    server.GET = () => json(426, errorBody('upgrade_required'));
    server.DELETE = () => json(426, errorBody('upgrade_required'));

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'upgrade_required' });
    // Refused, the deletion isn't sent again: the job expires on the server.
    expect(await repositories.analysisJobDeletions.list()).toEqual([]);
  });

  it.each([
    ['the network is gone', () => Promise.reject(new TypeError('Network request failed'))],
    ['the server fails', () => new Response('Bad Gateway', { status: 502 })],
    ['the server is busy', () => json(429, errorBody('rate_limited'))],
  ])('keeps the job waiting when %s, and asks again later (ANL-10)', async (_case, respond) => {
    await uploaded();
    server.GET = respond;

    await expect(checkAnalysisJobs()).resolves.toEqual({
      progress: { 'doc-1': null },
      changed: false,
    });
    expect(await documentOf()).toMatchObject({ status: 'analyzing' });

    server.GET = () => done();
    await checkAnalysisJobs();
    expect(await documentOf()).toMatchObject({ status: 'ready' });
  });

  it('does not ask about a job while its upload is still running', async () => {
    await seedDraft();
    const sent = uploadHangs();
    const upload = analyzeDocument('doc-1').catch(() => {});
    await sent;

    await expect(checkAnalysisJobs()).resolves.toEqual({ progress: {}, changed: false });

    expect(requests('GET')).toEqual([]);
    await cancelAnalysis('doc-1');
    await upload;
  });

  it('asks the server after a restart in the middle of an upload (ANL-4)', async () => {
    await seedDraft();
    // The app was killed during the upload: the document is analyzing under its job.
    await repositories.documents.startAnalysis('doc-1', { jobId: 'job-killed', locale: 'ru' });
    await repositories.documents.failInterruptedAnalyses();
    server.GET = () => json(200, { status: 'processing' });

    await checkAnalysisJobs();

    expect(requests('GET').map(({ url }) => url)).toEqual(['/api/v1/analyses/job-killed']);
    expect(await documentOf()).toMatchObject({ status: 'analyzing' });
    server.GET = () => json(404, errorBody('job_not_found'));
    await checkAnalysisJobs();
    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
  });

  it('fails as interrupted when the result can not be stored, and drops the job', async () => {
    await uploaded();
    server.GET = () => done();
    jest
      .spyOn(repositories.documents, 'saveAnalysis')
      .mockRejectedValueOnce(new Error('disk I/O error'));

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'failed', errorCode: 'interrupted' });
    expect(requests('DELETE')).toHaveLength(1);
  });

  it('sends a deletion that failed again on the next check, until the server answers', async () => {
    await uploaded();
    server.GET = () => done();
    server.DELETE = () => Promise.reject(new TypeError('Network request failed'));

    await checkAnalysisJobs();

    expect(await documentOf()).toMatchObject({ status: 'ready' });
    expect(await repositories.analysisJobDeletions.list()).toEqual([FIRST_JOB]);
    server.DELETE = noContent;
    await checkAnalysisJobs();
    expect(await repositories.analysisJobDeletions.list()).toEqual([]);
    expect(requests('DELETE')).toHaveLength(2);
  });

  it('drops the result of a document deleted while its job waited, and deletes the job', async () => {
    await uploaded();
    await repositories.documents.remove('doc-1');
    await forgetDocumentAnalysis('doc-1');
    server.GET = () => done();

    await checkAnalysisJobs();

    expect(requests('GET')).toEqual([]);
    expect(await documentOf()).toBeNull();
    expect(await repositories.deadlines.list({ documentId: 'doc-1' })).toEqual([]);
    expect(requests('DELETE').map(({ url }) => url)).toEqual([`/api/v1/analyses/${FIRST_JOB}`]);
  });
});

describe('cancelAnalysis (ANL-13)', () => {
  it('returns a waiting draft to draft and deletes its job, whose result is never stored', async () => {
    await seedDraft();
    server.PUT = () => queued();
    await analyzeDocument('doc-1');

    expect(await cancelAnalysis('doc-1')).toBe(true);
    await sendJobDeletions();

    expect(await documentOf()).toMatchObject({ status: 'draft', errorCode: null });
    expect(requests('DELETE').map(({ url }) => url)).toEqual([`/api/v1/analyses/${FIRST_JOB}`]);
    server.GET = () => done();
    await checkAnalysisJobs();
    expect(requests('GET')).toEqual([]);
    expect(await documentOf()).toMatchObject({ status: 'draft', analysis: null });
  });

  it('aborts an upload in progress before it deletes the job', async () => {
    await seedDraft();
    const sent = uploadHangs();
    const upload = analyzeDocument('doc-1');
    await sent;

    await cancelAnalysis('doc-1');
    await failureOf(upload);
    await sendJobDeletions();

    expect(requests().map(({ method }) => method)).toEqual(['PUT', 'DELETE']);
    expect(requests('PUT')[0].init?.signal?.aborted).toBe(true);
    // The aborted upload doesn't fail the cancelled document.
    expect(await documentOf()).toMatchObject({ status: 'draft', errorCode: null });
    expect(releaseAwake).toHaveBeenCalledTimes(1);
  });

  it('returns a document analyzed again to ready with its previous result (ANL-8)', async () => {
    await seedDraft();
    server.PUT = () => done(ANALYSIS_FIXTURES.invoice);
    await analyzeDocument('doc-1');
    server.PUT = () => queued();
    await analyzeDocument('doc-1');

    await cancelAnalysis('doc-1');

    expect(await documentOf()).toMatchObject({
      status: 'ready',
      analysis: ANALYSIS_FIXTURES.invoice,
    });
    expect(await repositories.deadlines.list({ documentId: 'doc-1' })).toHaveLength(1);
  });

  it('cancels nothing that is not being analyzed', async () => {
    await seedDraft();

    expect(await cancelAnalysis('doc-1')).toBe(false);
    expect(await cancelAnalysis('missing')).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('deleteAllAnalysisJobs (STO-7)', () => {
  it('sends DELETE for every unfinished job and every queued deletion, whatever the answer', async () => {
    server.PUT = () => queued();
    await seedDraft('waiting');
    await analyzeDocument('waiting');
    await seedDraft('cancelled');
    await analyzeDocument('cancelled');
    server.DELETE = () => Promise.reject(new TypeError('Network request failed'));
    await cancelAnalysis('cancelled');
    await sendJobDeletions();
    fetchSpy.mockClear();

    await expect(deleteAllAnalysisJobs()).resolves.toBeUndefined();

    expect(requests('DELETE').map(({ url }) => url)).toEqual([
      '/api/v1/analyses/uuid-1',
      '/api/v1/analyses/uuid-2',
    ]);
  });
});

describe('the push about a finished job (ANL-12)', () => {
  const TOKEN = 'ExponentPushToken[fake-device]';

  /** What each `PATCH` sent: the job and the body. */
  function patches() {
    return requests('PATCH').map(({ url, init }) => [url, JSON.parse(String(init?.body))]);
  }

  /** A document whose job waits on the server, uploaded without a token. */
  async function seedWaiting(id: string, jobId: string) {
    await seedDraft(id);
    await repositories.documents.startAnalysis(id, { jobId, locale: 'en' });
  }

  it('sends the push token with the upload when notifications are allowed', async () => {
    fakeNotifications.permission = 'granted';
    await seedDraft();
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    expect(sentForm().get('pushToken')).toBe(TOKEN);
  });

  it('uploads without a token, and asks for nothing, when notifications are not allowed (REM-5)', async () => {
    fakeNotifications.permission = 'undetermined';
    await seedDraft();
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    expect(sentForm().get('pushToken')).toBeNull();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('uploads without a token when the OS gives none (no FCM, no Google Play services)', async () => {
    fakeNotifications.permission = 'granted';
    fakeNotifications.pushToken = null;
    await seedDraft();
    server.PUT = () => queued();

    await analyzeDocument('doc-1');

    expect(sentForm().get('pushToken')).toBeNull();
    expect((await documentOf())?.status).toBe('analyzing');
  });

  it('gives every waiting job the token, but not one still uploading', async () => {
    fakeNotifications.permission = 'granted';
    await seedWaiting('doc-1', 'job-1');
    await seedWaiting('doc-2', 'job-2');
    await seedDraft('doc-3');
    const uploadSent = uploadHangs();
    const upload = analyzeDocument('doc-3').catch(() => undefined);
    await uploadSent;
    server.PATCH = noContent;

    await sendPushTokenToJobs();

    expect(patches()).toEqual([
      ['/api/v1/analyses/job-1', { pushToken: TOKEN }],
      ['/api/v1/analyses/job-2', { pushToken: TOKEN }],
    ]);
    expect(requests('PATCH')[0].init).toMatchObject({
      headers: { 'Content-Type': 'application/json' },
    });
    await cancelAnalysis('doc-3');
    await upload;
  });

  it('gives the jobs a token the push service has just changed', async () => {
    await seedWaiting('doc-1', 'job-1');
    server.PATCH = noContent;

    await sendPushTokenToJobs('ExponentPushToken[new]');

    expect(patches()).toEqual([
      ['/api/v1/analyses/job-1', { pushToken: 'ExponentPushToken[new]' }],
    ]);
  });

  it('sends nothing without the permission, or without jobs', async () => {
    fakeNotifications.permission = 'denied';
    await seedWaiting('doc-1', 'job-1');

    await sendPushTokenToJobs();
    fakeNotifications.permission = 'granted';
    await repositories.documents.cancelAnalysis('doc-1', 'job-1');
    await sendPushTokenToJobs();

    expect(requests('PATCH')).toEqual([]);
  });

  it('tells the other jobs when one can not be told now, and does not fail', async () => {
    fakeNotifications.permission = 'granted';
    await seedWaiting('doc-1', 'job-1');
    await seedWaiting('doc-2', 'job-2');
    server.PATCH = (url) =>
      url.endsWith('job-1') ? Promise.reject(new TypeError('Network request failed')) : noContent();

    await expect(sendPushTokenToJobs()).resolves.toBeUndefined();

    expect(patches().map(([url]) => url)).toEqual([
      '/api/v1/analyses/job-1',
      '/api/v1/analyses/job-2',
    ]);
  });

  describe('turnOnAnalysisPush: «Notify me when ready» (REM-5)', () => {
    it('asks for the permission and, granted, gives the waiting jobs the token', async () => {
      fakeNotifications.permission = 'undetermined';
      await seedWaiting('doc-1', 'job-1');
      server.PATCH = noContent;

      await expect(turnOnAnalysisPush()).resolves.toBe('granted');

      expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
      expect(patches()).toEqual([['/api/v1/analyses/job-1', { pushToken: TOKEN }]]);
    });

    it('sends nothing when the person refuses', async () => {
      fakeNotifications.permission = 'undetermined';
      fakeNotifications.answer = 'denied';
      await seedWaiting('doc-1', 'job-1');

      await expect(turnOnAnalysisPush()).resolves.toBe('denied');

      expect(requests('PATCH')).toEqual([]);
    });

    it('does not ask again when notifications are already allowed', async () => {
      fakeNotifications.permission = 'granted';
      await seedWaiting('doc-1', 'job-1');
      server.PATCH = noContent;

      await expect(turnOnAnalysisPush()).resolves.toBe('granted');

      expect(requestNotificationPermission).not.toHaveBeenCalled();
      expect(requests('PATCH')).toHaveLength(1);
    });
  });
});
