import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';

import { fakeFileSystem } from '@/test/fake-file-system';

import { pickFile, pickPhotos } from './pickers';

jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));

const launchLibrary = jest.mocked(ImagePicker.launchImageLibraryAsync);
const getDocument = jest.mocked(DocumentPicker.getDocumentAsync);

type LibraryResult = Awaited<ReturnType<typeof launchLibrary>>;
type DocumentResult = Awaited<ReturnType<typeof getDocument>>;

function photo(uri: string, overrides: Partial<ImagePicker.ImagePickerAsset> = {}) {
  return { uri, width: 3000, height: 4000, ...overrides } as ImagePicker.ImagePickerAsset;
}

beforeEach(() => fakeFileSystem.reset());
afterEach(() => {
  launchLibrary.mockReset();
  getDocument.mockReset();
});

describe('pickPhotos (CAP-3)', () => {
  it('asks for several images up to the page limit, in the order they are tapped', async () => {
    launchLibrary.mockResolvedValueOnce({ canceled: true, assets: null });

    await pickPhotos({ maxPages: 30 });

    expect(launchLibrary).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: 30,
      orderedSelection: true,
    });
  });

  it('returns the photos with what the picker reports about them', async () => {
    launchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [
        photo('file:///cache/1.jpg', {
          fileName: 'IMG_1.JPG',
          mimeType: 'image/jpeg',
          fileSize: 10,
        }),
        photo('file:///cache/2.heic', { fileName: null, mimeType: undefined, fileSize: 20 }),
      ],
    } as LibraryResult);

    expect(await pickPhotos({ maxPages: 30 })).toEqual({
      status: 'picked',
      files: [
        { uri: 'file:///cache/1.jpg', name: 'IMG_1.JPG', mimeType: 'image/jpeg', size: 10 },
        { uri: 'file:///cache/2.heic', name: null, mimeType: null, size: 20 },
      ],
    });
  });

  it('reads the size from the cached file when the picker leaves it out', async () => {
    fakeFileSystem.addFile('file:///cache/1.jpg', '12345');
    launchLibrary.mockResolvedValueOnce({
      canceled: false,
      assets: [photo('file:///cache/1.jpg'), photo('file:///cache/gone.jpg')],
    } as LibraryResult);

    const result = await pickPhotos({ maxPages: 30 });

    expect(result.status === 'picked' && result.files.map((file) => file.size)).toEqual([5, null]);
  });

  it('reports a cancel', async () => {
    launchLibrary.mockResolvedValueOnce({ canceled: true, assets: null });

    expect(await pickPhotos({ maxPages: 30 })).toEqual({ status: 'cancelled' });
  });

  it('reports a picker that fails', async () => {
    launchLibrary.mockRejectedValueOnce(new Error('No activity found'));

    expect(await pickPhotos({ maxPages: 30 })).toEqual({ status: 'failed' });
  });
});

describe('pickFile (CAP-3)', () => {
  it('asks for one PDF or image, copied into the cache, without base64 on web', async () => {
    getDocument.mockResolvedValueOnce({ canceled: true, assets: null });

    await pickFile();

    expect(getDocument).toHaveBeenCalledWith({
      type: ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'],
      multiple: false,
      copyToCacheDirectory: true,
      base64: false,
    });
  });

  it('returns the file with its name, type and size', async () => {
    getDocument.mockResolvedValueOnce({
      canceled: false,
      assets: [
        {
          uri: 'file:///cache/DocumentPicker/letter.pdf',
          name: 'letter.pdf',
          mimeType: 'application/pdf',
          size: 1234,
          lastModified: 0,
        },
      ],
    } as DocumentResult);

    expect(await pickFile()).toEqual({
      status: 'picked',
      files: [
        {
          uri: 'file:///cache/DocumentPicker/letter.pdf',
          name: 'letter.pdf',
          mimeType: 'application/pdf',
          size: 1234,
        },
      ],
    });
  });

  it('reports a cancel', async () => {
    getDocument.mockResolvedValueOnce({ canceled: true, assets: null });

    expect(await pickFile()).toEqual({ status: 'cancelled' });
  });

  it('ignores a second call while a picker is open, then allows a new one', async () => {
    let finish: (value: DocumentResult) => void = () => {};
    getDocument.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));

    const first = pickFile();
    expect(await pickPhotos({ maxPages: 30 })).toEqual({ status: 'busy' });
    expect(await pickFile()).toEqual({ status: 'busy' });
    finish({ canceled: true, assets: null });
    expect(await first).toEqual({ status: 'cancelled' });

    getDocument.mockResolvedValueOnce({ canceled: true, assets: null });
    expect(await pickFile()).toEqual({ status: 'cancelled' });
    expect(getDocument).toHaveBeenCalledTimes(2);
    expect(launchLibrary).not.toHaveBeenCalled();
  });
});
