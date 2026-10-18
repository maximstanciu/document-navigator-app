import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import DocumentRoute from '@/app/documents/[id]';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { createTestProviders, renderWithProviders } from '@/test/render';
import { createFakeClock, installTestRepositories } from '@/test/sqlite';

import * as api from '../api';
import { DocumentListScreen } from './document-list-screen';

let repositories: Repositories;
let clock: ReturnType<typeof createFakeClock>;

beforeEach(async () => {
  clock = createFakeClock('2026-10-17T09:00:00.000Z');
  ({ repositories } = await installTestRepositories(clock.now));
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

async function addDocument(id: string, title: string) {
  await repositories.documents.create({
    id,
    title,
    source: 'scan',
    mimeType: 'image/jpeg',
    pageCount: 2,
    fileSize: 1000,
  });
  clock.advance(60_000);
}

describe('DocumentListScreen', () => {
  it('lists documents from the local database, newest first', async () => {
    await addDocument('older', 'Счёт за газ');
    await addDocument('newer', 'Письмо из налоговой');
    await repositories.documents.update('older', { status: 'ready', senderName: 'Stadtwerke' });

    await renderWithProviders(<DocumentListScreen />);

    const links = await screen.findAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAccessibleName(/^Письмо из налоговой, .*2 pages · Not analyzed$/);
    expect(links[1]).toHaveAccessibleName(/^Счёт за газ, Stadtwerke, .*2 pages · Analyzed$/);
  });

  it('shows Russian text and plural forms in Russian', async () => {
    await i18n.changeLanguage('ru');
    for (const [id, pages] of [
      ['one', 1],
      ['few', 2],
      ['many', 5],
      ['twenty-one', 21],
    ] as const) {
      await repositories.documents.create({
        id,
        title: `Документ ${pages}`,
        source: 'scan',
        mimeType: 'image/jpeg',
        pageCount: pages,
        fileSize: 1,
      });
    }

    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByRole('heading', { name: 'Документы' })).toBeOnTheScreen();
    for (const text of ['1 страница', '2 страницы', '5 страниц', '21 страница']) {
      expect(screen.getByText(new RegExp(`· ${text} · Не разобран$`))).toBeOnTheScreen();
    }
  });

  it('does not show deleted documents', async () => {
    await addDocument('kept', 'Договор');
    await addDocument('deleted', 'Удалённый');
    await repositories.documents.remove('deleted');

    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByText('Договор')).toBeOnTheScreen();
    expect(screen.queryByText('Удалённый')).not.toBeOnTheScreen();
  });

  it('shows an empty state with «Add» when there are no documents', async () => {
    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByText('No documents yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Add a document' })).toBeOnTheScreen();
  });

  it('shows an error with a retry that reloads', async () => {
    const user = userEvent.setup();
    await addDocument('doc-1', 'Счёт за газ');
    jest.spyOn(api, 'listDocuments').mockRejectedValueOnce(new Error('Database is busy'));
    await renderWithProviders(<DocumentListScreen />);

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Счёт за газ')).toBeOnTheScreen();
  });

  it('opens the document screen when a row is pressed', async () => {
    const user = userEvent.setup();
    await addDocument('doc-1', 'Счёт за газ');
    await renderRouter(
      { index: DocumentListScreen, 'documents/[id]': DocumentRoute },
      { initialUrl: '/', wrapper: createTestProviders() }
    );

    await user.press(await screen.findByRole('link', { name: /Счёт за газ/ }));

    expect(screen).toHavePathname('/documents/doc-1');
    expect(await screen.findByRole('heading', { name: 'Счёт за газ' })).toBeOnTheScreen();
  });

  it('opens the choice of source from «Add» (CAP-1)', async () => {
    const user = userEvent.setup();
    await addDocument('doc-1', 'Счёт за газ');
    await renderRouter(
      {
        index: DocumentListScreen,
        'capture/_layout': CaptureLayout,
        'capture/index': CaptureRoute,
      },
      { initialUrl: '/', wrapper: createTestProviders() }
    );

    await user.press(await screen.findByRole('button', { name: 'Add a document' }));

    expect(screen).toHavePathname('/capture');
    expect(await screen.findByRole('button', { name: 'Scan' })).toBeOnTheScreen();
  });
});
