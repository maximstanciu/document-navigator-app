import { screen, userEvent } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import DocumentPagesRoute from '@/app/documents/[id]/pages';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { fakeFileSystem } from '@/test/fake-file-system';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { openOriginalFile, shareOriginalFile } from '../original-file';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('../original-file', () => ({
  openOriginalFile: jest.fn(async () => {}),
  shareOriginalFile: jest.fn(async () => {}),
}));

const open = jest.mocked(openOriginalFile);
const share = jest.mocked(shareOriginalFile);
const root = fakeFileSystem.documentRoot;

/** Inside a stack, so the header with «Open» and «Share» renders too. */
function renderPages(url = '/documents/doc-1/pages') {
  return renderRouter(
    { _layout: () => <Stack />, 'documents/[id]/pages': DocumentPagesRoute },
    { initialUrl: url, wrapper: createTestProviders() }
  );
}

let repositories: Repositories;

/** «Счёт за свет» with `pages` JPEG pages on the device, or one PDF. */
async function seedDocument({ pdf = false, pages = 3 }: { pdf?: boolean; pages?: number } = {}) {
  const records = Array.from({ length: pdf ? 1 : pages }, (_, index) => ({
    id: `p${index + 1}`,
    relativePath: `documents/doc-1/p${index + 1}.${pdf ? 'pdf' : 'jpg'}`,
    width: null,
    height: null,
  }));
  for (const page of records) fakeFileSystem.addFile(`${root}/${page.relativePath}`);
  await repositories.documents.create(
    {
      id: 'doc-1',
      title: 'Счёт за свет',
      source: pdf ? 'file' : 'scan',
      mimeType: pdf ? 'application/pdf' : 'image/jpeg',
      pageCount: pdf ? null : pages,
      fileSize: 1_200_000,
    },
    records
  );
}

beforeEach(async () => {
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
});

afterEach(() => {
  setRepositories(null);
  open.mockReset();
  share.mockReset();
});

describe('PageViewerScreen (DET-7)', () => {
  it('opens at the page from the link and steps through the pages', async () => {
    await seedDocument();
    await renderPages('/documents/doc-1/pages?page=2');
    const user = userEvent.setup();

    expect(await screen.findByText('Page 2 of 3')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 2')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 3 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled();

    await user.press(screen.getByRole('button', { name: 'Previous page' }));
    await user.press(screen.getByRole('button', { name: 'Previous page' }));
    expect(screen.getByText('Page 1 of 3')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled();
  });

  it('opens the shown page in the system viewer and shares it', async () => {
    await seedDocument();
    await renderPages('/documents/doc-1/pages?page=2');
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Open page 2 in another app' }));
    const page2 = { uri: `${root}/documents/doc-1/p2.jpg`, mimeType: 'image/jpeg' };
    expect(open).toHaveBeenCalledWith({ ...page2, title: 'Счёт за свет' });

    await user.press(screen.getByRole('button', { name: 'Save or send page 2' }));
    expect(share).toHaveBeenCalledWith({ ...page2, title: 'Счёт за свет' }, 'Share');
  });

  it('says when the file could not be opened', async () => {
    await seedDocument();
    open.mockRejectedValue(new Error('No activity'));
    await renderPages();
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Open page 1 in another app' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't open the file. Try again."
    );
  });

  it('stops at the last page for a page number past the end', async () => {
    await seedDocument();
    await renderPages('/documents/doc-1/pages?page=9');

    expect(await screen.findByText('Page 3 of 3')).toBeOnTheScreen();
  });

  it('marks a page whose file is gone, with nothing to open or share (STO-8)', async () => {
    await seedDocument({ pages: 2 });
    fakeFileSystem.reset();
    fakeFileSystem.addFile(`${root}/documents/doc-1/p1.jpg`);
    await renderPages('/documents/doc-1/pages?page=2');

    expect(await screen.findByText('Page 2 is not available')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Open page/ })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: /^Save or send page/ })).not.toBeOnTheScreen();
  });

  it('says the original is not available when no file is left', async () => {
    await seedDocument();
    fakeFileSystem.reset();
    await renderPages();

    expect(await screen.findByText(/The original isn't available/)).toBeOnTheScreen();
  });

  it('shows a PDF as its file card with «Open» and «Share» (D-4)', async () => {
    await seedDocument({ pdf: true });
    await renderPages();
    const user = userEvent.setup();

    await user.press(await screen.findByRole('button', { name: 'Open the PDF in another app' }));
    const pdf = { uri: `${root}/documents/doc-1/p1.pdf`, mimeType: 'application/pdf' };
    expect(open).toHaveBeenCalledWith({ ...pdf, title: 'Счёт за свет' });
    expect(screen.queryByText(/^Page \d of/)).not.toBeOnTheScreen();
  });

  it('says the document is gone when it was deleted', async () => {
    await renderPages('/documents/missing/pages');

    expect(await screen.findByText('Document not found')).toBeOnTheScreen();
  });
});
