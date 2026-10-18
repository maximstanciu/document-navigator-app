import { fakeFileSystem } from '@/test/fake-file-system';

import {
  capturedFileSize,
  deleteAllDocumentFiles,
  deleteDocumentFiles,
  deletePageFiles,
  pageFileExists,
  pageFileUri,
  savePageFile,
} from './page-files';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));

const ROOT = fakeFileSystem.documentRoot;
const SCAN = 'file:///data/cache/scanner/page-1.jpg';

beforeEach(() => {
  fakeFileSystem.reset();
  fakeFileSystem.addFile(SCAN);
});

describe('page files (STO-2, STO-3)', () => {
  it('copies a page into the document folder and returns a relative path', async () => {
    const relativePath = await savePageFile('doc-1', SCAN, 'page-1.jpg');

    expect(relativePath).toBe('documents/doc-1/page-1.jpg');
    expect(fakeFileSystem.files()).toContain(`${ROOT}/documents/doc-1/page-1.jpg`);
    expect(pageFileUri(relativePath)).toBe(`${ROOT}/documents/doc-1/page-1.jpg`);
    await expect(pageFileExists(relativePath)).resolves.toBe(true);
  });

  it('overwrites a page saved under the same name', async () => {
    await savePageFile('doc-1', SCAN, 'page-1.jpg');

    await expect(savePageFile('doc-1', SCAN, 'page-1.jpg')).resolves.toBe(
      'documents/doc-1/page-1.jpg'
    );
  });

  it('refuses ids and names that would escape the documents folder', async () => {
    await expect(savePageFile('../etc', SCAN, 'page.jpg')).rejects.toThrow(/document id/);
    await expect(savePageFile('doc-1', SCAN, '../page.jpg')).rejects.toThrow(/file name/);
    await expect(savePageFile('doc-1', SCAN, 'a/b.jpg')).rejects.toThrow(/file name/);
    expect(() => pageFileUri('/data/app/files/documents/doc-1/page.jpg')).toThrow(
      /Not a page file path/
    );
    await expect(deletePageFiles(['documents/../../secret'])).rejects.toThrow();
  });

  it('reports a missing file instead of failing (STO-8)', async () => {
    await expect(pageFileExists('documents/doc-1/gone.jpg')).resolves.toBe(false);
  });

  it('deletes given pages and skips ones already gone', async () => {
    const first = await savePageFile('doc-1', SCAN, 'page-1.jpg');
    const second = await savePageFile('doc-1', SCAN, 'page-2.jpg');

    await deletePageFiles([first, 'documents/doc-1/never-saved.jpg']);

    await expect(pageFileExists(first)).resolves.toBe(false);
    await expect(pageFileExists(second)).resolves.toBe(true);
  });

  it('deletes all pages of one document (STO-6)', async () => {
    await savePageFile('doc-1', SCAN, 'page-1.jpg');
    await savePageFile('doc-1', SCAN, 'page-2.jpg');
    const other = await savePageFile('doc-2', SCAN, 'page-1.jpg');

    await deleteDocumentFiles('doc-1');
    await deleteDocumentFiles('doc-1');

    expect(fakeFileSystem.files()).toEqual([`${ROOT}/documents/doc-2/page-1.jpg`, SCAN].sort());
    await expect(pageFileExists(other)).resolves.toBe(true);
  });

  it('deletes the pages of every document (STO-7)', async () => {
    await savePageFile('doc-1', SCAN, 'page-1.jpg');
    await savePageFile('doc-2', SCAN, 'page-1.jpg');

    await deleteAllDocumentFiles();
    await deleteAllDocumentFiles();

    expect(fakeFileSystem.files()).toEqual([SCAN]);
  });
});

describe('capturedFileSize', () => {
  it('reads the size of a file in the picker cache', () => {
    fakeFileSystem.addFile('file:///data/cache/picked.pdf', '1234567');

    expect(capturedFileSize('file:///data/cache/picked.pdf')).toBe(7);
  });

  it('is null for a file that is gone', () => {
    expect(capturedFileSize('file:///data/cache/gone.pdf')).toBeNull();
  });
});
