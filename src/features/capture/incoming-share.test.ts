import * as Sharing from 'expo-sharing';

import { Directory, fakeFileSystem } from '@/test/fake-file-system';

import { takeSharedFiles } from './incoming-share';

jest.mock('expo-sharing', () => ({
  getSharedPayloads: jest.fn(),
  getResolvedSharedPayloadsAsync: jest.fn(),
  clearSharedPayloads: jest.fn(),
}));
jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));

const rawPayloads = jest.mocked(Sharing.getSharedPayloads);
const resolvePayloads = jest.mocked(Sharing.getResolvedSharedPayloadsAsync);
const clearPayloads = jest.mocked(Sharing.clearSharedPayloads);

type Resolved = Sharing.ResolvedSharePayload;

const SHARING_CACHE = `${fakeFileSystem.cacheRoot}/expo-sharing`;
const SHARED_FOLDER = `${fakeFileSystem.cacheRoot}/shared-files`;

/** A file expo-sharing copied out of the other app, with the `file:/` URI Android gives it. */
function sharedFile(name: string, mimeType: string, overrides: Partial<Resolved> = {}): Resolved {
  const uri = `${SHARING_CACHE}/${name}`;
  fakeFileSystem.addFile(uri, 'shared bytes');
  return {
    value: `content://other.app/${name}`,
    shareType: mimeType === 'application/pdf' ? 'file' : 'image',
    mimeType,
    contentUri: uri.replace('file:///', 'file:/'),
    contentType: mimeType === 'application/pdf' ? 'file' : 'image',
    contentMimeType: mimeType,
    contentSize: 2048,
    originalName: name,
    ...overrides,
  } as Resolved;
}

function shares(...payloads: Resolved[]) {
  rawPayloads.mockReturnValue(
    payloads.map(({ value, mimeType, shareType }) => ({ value, mimeType, shareType }))
  );
  resolvePayloads.mockResolvedValue(payloads);
}

beforeEach(() => {
  fakeFileSystem.reset();
  rawPayloads.mockReturnValue([]);
});
afterEach(() => jest.resetAllMocks());

describe('takeSharedFiles (CAP-11)', () => {
  it('reports nothing when no app shared anything, and leaves the share alone', async () => {
    await expect(takeSharedFiles()).resolves.toEqual({ status: 'none' });
    expect(resolvePayloads).not.toHaveBeenCalled();
    expect(clearPayloads).not.toHaveBeenCalled();
  });

  it("moves the shared files into the app's folder in order, then clears the share", async () => {
    shares(
      sharedFile('Счёт за май.pdf', 'application/pdf'),
      sharedFile('photo.HEIC', 'image/heic', { contentSize: null })
    );

    const result = await takeSharedFiles();

    expect(result).toEqual({
      status: 'shared',
      files: [
        {
          uri: `${SHARED_FOLDER}/1.pdf`,
          name: 'Счёт за май.pdf',
          mimeType: 'application/pdf',
          size: 2048,
        },
        // Unknown size: read from the moved file.
        { uri: `${SHARED_FOLDER}/2.heic`, name: 'photo.HEIC', mimeType: 'image/heic', size: 12 },
      ],
    });
    expect(fakeFileSystem.files()).toEqual([`${SHARED_FOLDER}/1.pdf`, `${SHARED_FOLDER}/2.heic`]);
    expect(clearPayloads).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest share in its folder', async () => {
    new Directory(SHARED_FOLDER).create({ intermediates: true });
    fakeFileSystem.addFile(`${SHARED_FOLDER}/1.jpg`);
    shares(sharedFile('scan.png', 'image/png'));

    await takeSharedFiles();

    expect(fakeFileSystem.files()).toEqual([`${SHARED_FOLDER}/1.png`]);
  });

  it('fails, and clears the share, when expo-sharing could not copy a file', async () => {
    const missing = sharedFile('gone.pdf', 'application/pdf');
    fakeFileSystem.reset();
    shares(missing);

    await expect(takeSharedFiles()).resolves.toEqual({ status: 'failed' });
    expect(clearPayloads).toHaveBeenCalledTimes(1);
  });

  it('fails when the files cannot be resolved', async () => {
    rawPayloads.mockReturnValue([
      { value: 'content://x', mimeType: 'application/pdf', shareType: 'file' },
    ]);
    resolvePayloads.mockRejectedValue(new Error('resolving failed'));

    await expect(takeSharedFiles()).resolves.toEqual({ status: 'failed' });
    expect(clearPayloads).toHaveBeenCalledTimes(1);
  });

  it('passes shared text on as a file of its type, for the check to turn down', async () => {
    shares({
      value: 'Hello',
      shareType: 'text',
      mimeType: 'text/plain',
      contentUri: null,
      contentType: 'text',
      contentMimeType: 'text/plain',
      contentSize: null,
      originalName: null,
    } as Resolved);

    await expect(takeSharedFiles()).resolves.toEqual({
      status: 'shared',
      files: [{ uri: 'Hello', name: null, mimeType: 'text/plain', size: null }],
    });
  });

  it('takes a share once: a call while it is taken gets the same files, a later one none', async () => {
    shares(sharedFile('letter.jpg', 'image/jpeg'));

    const [first, second] = await Promise.all([takeSharedFiles(), takeSharedFiles()]);
    expect(second).toBe(first);
    expect(resolvePayloads).toHaveBeenCalledTimes(1);

    rawPayloads.mockReturnValue([]);
    await expect(takeSharedFiles()).resolves.toEqual({ status: 'none' });
  });
});
