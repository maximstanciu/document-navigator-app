import { focusManager } from '@tanstack/react-query';
import { act, screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import DocumentRoute from '@/app/documents/[id]';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import type { DocumentRecord } from '@/lib/db/types';
import { i18n } from '@/lib/i18n/i18n';
import { isOnline } from '@/lib/network';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import { fakeFileSystem } from '@/test/fake-file-system';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('@/lib/network', () => ({ isOnline: jest.fn() }));
jest.mock('@/lib/api/client-headers', () => ({ getClientHeaders: async () => ({}) }));
jest.mock('../keep-awake', () => ({ keepScreenAwake: () => () => {} }));
jest.mock('../upload-file', () => ({
  appendUploadFile: async (form: FormData, field: string, file: { uri: string; name: string }) =>
    form.append(field, new Blob([file.uri]), file.name),
}));

let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

const online = jest.mocked(isOnline);

let repositories: Repositories;
let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

function json(status: number, body: unknown, headers?: Record<string, string>) {
  return new Response(JSON.stringify(body), { status, headers });
}

const done = () => json(200, { status: 'done', analysis: ANALYSIS_FIXTURES.invoice, pageCount: 1 });

type Respond = (init?: RequestInit) => Response | Promise<Response>;

/** A response that never comes; the request ends only when it's aborted, as with `fetch`. */
const hang: Respond = (init) =>
  new Promise((_resolve, reject) =>
    init?.signal?.addEventListener('abort', () =>
      reject(new DOMException('The operation was aborted.', 'AbortError'))
    )
  );

/** The analysis server, by method; `DELETE` answers `204`. */
const server: { PUT?: Respond; GET?: Respond; DELETE: Respond } = {
  DELETE: () => new Response(null, { status: 204 }),
};

const sent = (method: string) =>
  fetchSpy.mock.calls.filter(([, init]) => (init?.method ?? 'GET') === method);

/** A one-page draft with its file, in the status the test needs (SPEC §6.3). */
async function seedDocument(
  status: 'draft' | 'analyzing' | 'failed' = 'draft',
  errorCode: NonNullable<DocumentRecord['errorCode']> = 'network'
) {
  const relativePath = 'documents/doc-1/p1.jpg';
  fakeFileSystem.addFile(`${fakeFileSystem.documentRoot}/${relativePath}`);
  await repositories.documents.create(
    { id: 'doc-1', title: '', source: 'scan', mimeType: 'image/jpeg', fileSize: 1000 },
    [{ id: 'p1', relativePath, width: 1448, height: 2048 }]
  );
  if (status === 'draft') return;
  await repositories.documents.startAnalysis('doc-1', { jobId: 'job-1', locale: 'en' });
  if (status === 'failed') {
    await repositories.documents.failAnalysis('doc-1', { jobId: 'job-1', code: errorCode });
  }
}

async function renderDocument() {
  await renderRouter(
    { 'documents/[id]': DocumentRoute },
    { initialUrl: '/documents/doc-1', wrapper: createTestProviders() }
  );
}

/** The app goes to the background and comes back (SPEC §7.2 «Опрос»). */
async function returnToForeground() {
  await act(async () => {
    focusManager.setFocused(false);
    focusManager.setFocused(true);
  });
}

beforeEach(async () => {
  mockUuidCounter = 0;
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  online.mockResolvedValue(true);
  delete server.PUT;
  delete server.GET;
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const respond = server[(init?.method ?? 'GET') as keyof typeof server];
    if (!respond) throw new TypeError(`Network request failed: ${String(url)}`);
    return respond(init);
  });
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
  focusManager.setFocused(undefined);
});

describe('AnalysisStatusPanel on the document screen', () => {
  it('uploads a draft, shows its place in the queue and then the result (ANL-3)', async () => {
    const user = userEvent.setup();
    let answer!: (response: Response) => void;
    server.PUT = () => new Promise((resolve) => (answer = resolve));
    server.GET = () => json(200, { status: 'queued', ahead: 2 });
    await seedDocument('draft');
    await renderDocument();

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Analyze the document' }));

    expect(await screen.findByText('Uploading the document…')).toBeOnTheScreen();
    expect(screen.getByText('Keep the app open until the upload is done.')).toBeOnTheScreen();

    answer(json(202, { status: 'queued', ahead: 2 }));

    expect(await screen.findByText('In the queue: 2 documents ahead of yours')).toBeOnTheScreen();
    expect(screen.getByText(/You can close the app/)).toBeOnTheScreen();

    server.GET = done;
    await returnToForeground();

    expect(
      await screen.findByRole('heading', { name: 'Счёт за электричество, сентябрь 2026' })
    ).toBeOnTheScreen();
    expect(screen.getByRole('heading', { name: 'In short' })).toBeOnTheScreen();
    expect(screen.queryByText(/You can close the app/)).not.toBeOnTheScreen();
    expect(sent('DELETE')).toHaveLength(1);
  });

  it('shows a job waiting from an earlier run, and asks the server about it (ANL-4)', async () => {
    server.GET = () => json(200, { status: 'processing' });
    await seedDocument('analyzing');
    await renderDocument();

    expect(await screen.findByText('Analyzing the document…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Analyze the document' })).not.toBeOnTheScreen();
    expect(sent('GET')[0][0]).toBe('/api/v1/analyses/job-1');
  });

  it('says the analysis was interrupted when the server no longer has the job (ANL-4)', async () => {
    server.GET = () => json(404, { error: { code: 'job_not_found', message: 'No job' } });
    await seedDocument('analyzing');
    await renderDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(/The analysis stopped/);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
  });

  it('cancels a waiting analysis: the draft comes back and the job is deleted (ANL-13)', async () => {
    const user = userEvent.setup();
    server.GET = () => json(200, { status: 'queued', ahead: 1 });
    await seedDocument('analyzing');
    await renderDocument();

    await user.press(await screen.findByRole('button', { name: 'Cancel the analysis' }));

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    expect(sent('DELETE')[0][0]).toBe('/api/v1/analyses/job-1');
  });

  it('cancels during the upload too', async () => {
    const user = userEvent.setup();
    server.PUT = hang;
    await seedDocument('draft');
    await renderDocument();
    await user.press(await screen.findByRole('button', { name: 'Analyze the document' }));

    await user.press(await screen.findByRole('button', { name: 'Cancel the analysis' }));

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('says why an analysis failed and tries again (ANL-9)', async () => {
    const user = userEvent.setup();
    server.PUT = () => json(202, { status: 'processing' });
    server.GET = done;
    await seedDocument('failed', 'offline');
    await renderDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "No internet connection. The document is saved: analyze it once you're online."
    );
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByRole('heading', { name: 'Счёт за электричество, сентябрь 2026' })
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('tells when the limit lets the person try again after a 429 (ANL-9)', async () => {
    const user = userEvent.setup();
    server.PUT = () =>
      json(429, { error: { code: 'rate_limited', message: 'Limit' } }, { 'Retry-After': '600' });
    await seedDocument('failed', 'network');
    await renderDocument();

    await user.press(await screen.findByRole('button', { name: 'Try again' }));

    expect(
      await screen.findByText(/^The analysis limit is reached\. You can try again after .+\.$/)
    ).toBeOnTheScreen();
  });

  it('does not offer «Try again» where it would fail the same way', async () => {
    await seedDocument('failed', 'encrypted_pdf');
    await renderDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The file is password-protected. Open it, save a copy without the password and add that copy.'
    );
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeOnTheScreen();
  });

  it('names the limits when the document is too large, in Russian too', async () => {
    await seedDocument('failed', 'too_large');
    await renderDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The document is too large to analyze: it can have at most 30 pages and 20 MB.'
    );

    await i18n.changeLanguage('ru');
    expect(
      await screen.findByText(
        'Документ слишком большой для анализа: в нём может быть не больше 30 страниц и 20 МБ.'
      )
    ).toBeOnTheScreen();
  });
});
