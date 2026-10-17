import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';

import DocumentRoute from '@/app/documents/[id]';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import * as api from '../api';

/** The screen sets its header title, so it renders inside a router. */
function renderDocument(id: string) {
  return renderRouter(
    { 'documents/[id]': DocumentRoute },
    { initialUrl: `/documents/${id}`, wrapper: createTestProviders() }
  );
}

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  await repositories.documents.create({
    id: 'doc-1',
    title: 'Штраф за парковку',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 1000,
  });
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

describe('DocumentDetailScreen', () => {
  it('shows the document from the local database', async () => {
    await repositories.documents.update('doc-1', {
      status: 'ready',
      senderName: 'Ordnungsamt',
      pageCount: 3,
    });

    await renderDocument('doc-1');

    expect(await screen.findByRole('heading', { name: 'Штраф за парковку' })).toBeOnTheScreen();
    expect(screen.getByText('Analyzed')).toBeOnTheScreen();
    expect(screen.getByText('Ordnungsamt')).toBeOnTheScreen();
    expect(screen.getByText('PDF')).toBeOnTheScreen();
    expect(screen.getByText('3 pages')).toBeOnTheScreen();
  });

  it('leaves out the page count of a PDF that has not been analyzed (D-4)', async () => {
    await renderDocument('doc-1');

    expect(await screen.findByText('Not analyzed')).toBeOnTheScreen();
    expect(screen.queryByText('Pages')).not.toBeOnTheScreen();
  });

  it('says so when the document was deleted', async () => {
    await repositories.documents.remove('doc-1');

    await renderDocument('doc-1');

    expect(await screen.findByText('Document not found')).toBeOnTheScreen();
  });

  it('shows an error with a retry that reloads', async () => {
    const user = userEvent.setup();
    jest.spyOn(api, 'getDocument').mockRejectedValueOnce(new Error('Database is busy'));
    await renderDocument('doc-1');

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Штраф за парковку' })).toBeOnTheScreen();
  });
});
