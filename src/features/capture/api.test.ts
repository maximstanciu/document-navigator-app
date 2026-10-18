import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { fakeFileSystem } from '@/test/fake-file-system';
import { installTestRepositories } from '@/test/sqlite';

import { saveDraft } from './api';
import type { CapturedPage } from './types';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

const ROOT = fakeFileSystem.documentRoot;

function jpeg(uri: string, size: number | null = 400_000): CapturedPage {
  return { uri, mimeType: 'image/jpeg', size, name: null, width: 1448, height: 2048 };
}

const PDF: CapturedPage = {
  uri: 'file:///cache/DocumentPicker/letter.pdf',
  mimeType: 'application/pdf',
  size: 3_000_000,
  name: 'letter.pdf',
  width: null,
  height: null,
};

let repositories: Repositories;

beforeEach(async () => {
  mockUuidCounter = 0;
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

describe('saveDraft (CAP-5)', () => {
  it('saves the pages in order as a draft with its files in the document folder', async () => {
    fakeFileSystem.addFile('file:///cache/p1.jpg');
    fakeFileSystem.addFile('file:///cache/p2.jpg');

    const id = await saveDraft('scan', [
      jpeg('file:///cache/p1.jpg'),
      jpeg('file:///cache/p2.jpg', null),
    ]);

    expect(id).toBe('uuid-1');
    expect(await repositories.documents.get(id)).toMatchObject({
      title: '',
      status: 'draft',
      source: 'scan',
      mimeType: 'image/jpeg',
      pageCount: 2,
      // A page of unknown size counts as zero.
      fileSize: 400_000,
    });
    expect(await repositories.pages.listByDocument(id)).toEqual([
      expect.objectContaining({
        index: 0,
        relativePath: 'documents/uuid-1/uuid-2.jpg',
        width: 1448,
        height: 2048,
      }),
      expect.objectContaining({ index: 1, relativePath: 'documents/uuid-1/uuid-3.jpg' }),
    ]);
    expect(fakeFileSystem.files()).toEqual(
      expect.arrayContaining([
        `${ROOT}/documents/uuid-1/uuid-2.jpg`,
        `${ROOT}/documents/uuid-1/uuid-3.jpg`,
      ])
    );
  });

  it('saves a PDF as one page with an unknown page count (D-4)', async () => {
    fakeFileSystem.addFile(PDF.uri);

    const id = await saveDraft('file', [PDF]);

    expect(await repositories.documents.get(id)).toMatchObject({
      source: 'file',
      mimeType: 'application/pdf',
      pageCount: null,
      fileSize: 3_000_000,
    });
    expect(await repositories.pages.listByDocument(id)).toEqual([
      expect.objectContaining({ index: 0, relativePath: 'documents/uuid-1/uuid-2.pdf' }),
    ]);
  });

  it('leaves nothing behind when a page file can not be copied', async () => {
    fakeFileSystem.addFile('file:///cache/p1.jpg');

    await expect(
      saveDraft('gallery', [jpeg('file:///cache/p1.jpg'), jpeg('file:///cache/gone.jpg')])
    ).rejects.toThrow('Source missing');

    expect(await repositories.documents.list()).toEqual([]);
    expect(fakeFileSystem.files()).toEqual(['file:///cache/p1.jpg']);
  });

  it('deletes the copied files when the database write fails', async () => {
    fakeFileSystem.addFile('file:///cache/p1.jpg');
    jest.spyOn(repositories.documents, 'create').mockRejectedValueOnce(new Error('disk I/O error'));

    await expect(saveDraft('scan', [jpeg('file:///cache/p1.jpg')])).rejects.toThrow(
      'disk I/O error'
    );

    expect(fakeFileSystem.files()).toEqual(['file:///cache/p1.jpg']);
  });

  it('refuses a draft without pages', async () => {
    await expect(saveDraft('scan', [])).rejects.toThrow('at least one page');
  });
});
