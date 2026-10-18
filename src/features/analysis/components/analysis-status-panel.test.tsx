import { screen, userEvent } from '@testing-library/react-native';
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

const analyzed = () => json(200, { analysis: ANALYSIS_FIXTURES.invoice, pageCount: 1 });

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
  await repositories.documents.startAnalysis('doc-1');
  if (status === 'failed') await repositories.documents.failAnalysis('doc-1', errorCode);
}

async function renderDocument() {
  await renderRouter(
    { 'documents/[id]': DocumentRoute },
    { initialUrl: '/documents/doc-1', wrapper: createTestProviders() }
  );
}

beforeEach(async () => {
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  online.mockResolvedValue(true);
  fetchSpy = jest.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

describe('AnalysisStatusPanel on the document screen', () => {
  it('analyzes a draft, asks to keep the app open meanwhile and shows the result (ANL-3)', async () => {
    const user = userEvent.setup();
    let answer!: (response: Response) => void;
    fetchSpy.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    await seedDocument('draft');
    await renderDocument();

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Analyze the document' }));

    expect(await screen.findByText('Reading the document…')).toBeOnTheScreen();
    expect(screen.getByText(/Keep the app open until the analysis is done/)).toBeOnTheScreen();
    expect(screen.getByText('Analyzing…')).toBeOnTheScreen();

    answer(analyzed());

    expect(
      await screen.findByRole('heading', { name: 'Счёт за электричество, сентябрь 2026' })
    ).toBeOnTheScreen();
    expect(screen.getByText('Analyzed')).toBeOnTheScreen();
    expect(screen.queryByText('Reading the document…')).not.toBeOnTheScreen();
  });

  it('shows an analysis in progress started elsewhere, e.g. on the review screen', async () => {
    await seedDocument('analyzing');
    await renderDocument();

    expect(await screen.findByText('Reading the document…')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Analyze the document' })).not.toBeOnTheScreen();
  });

  it('says why an analysis failed and tries again (ANL-9)', async () => {
    const user = userEvent.setup();
    fetchSpy.mockResolvedValue(analyzed());
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
    fetchSpy.mockResolvedValue(
      json(429, { error: { code: 'rate_limited', message: 'Limit' } }, { 'Retry-After': '600' })
    );
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
