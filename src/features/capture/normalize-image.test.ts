import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { fakeFileSystem } from '@/test/fake-file-system';

import { normalizeImage, PAGE_JPEG_QUALITY, PAGE_MAX_SIDE } from './normalize-image';

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));
jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));

const manipulate = jest.mocked(ImageManipulator.manipulate);

/** A manipulator context whose render and save resolve or reject as given. */
function mockManipulator({
  save = Promise.resolve({ uri: 'file:///cache/out.jpg', width: 1448, height: 2048 }),
  render,
}: {
  save?: Promise<{ uri: string; width: number; height: number }>;
  render?: Promise<never>;
} = {}) {
  const image = { saveAsync: jest.fn(() => save), release: jest.fn() };
  const context = {
    renderAsync: jest.fn(() => render ?? Promise.resolve(image)),
    release: jest.fn(),
  };
  // Only the methods normalizeImage() calls are faked, not the whole native shared object.
  manipulate.mockReturnValueOnce(context as unknown as ReturnType<typeof manipulate>);
  return { context, image };
}

beforeEach(() => fakeFileSystem.reset());
afterEach(() => manipulate.mockReset());

describe('normalizeImage (CAP-4)', () => {
  it('decodes within 2048 px and saves a JPEG at quality 0.8', async () => {
    const { image } = mockManipulator();

    await normalizeImage('file:///cache/photo.heic');

    expect(PAGE_MAX_SIDE).toBe(2048);
    expect(PAGE_JPEG_QUALITY).toBe(0.8);
    expect(manipulate).toHaveBeenCalledWith('file:///cache/photo.heic', {
      maxWidth: 2048,
      maxHeight: 2048,
    });
    expect(image.saveAsync).toHaveBeenCalledWith({ format: SaveFormat.JPEG, compress: 0.8 });
  });

  it('returns the new file with its dimensions and size', async () => {
    fakeFileSystem.addFile('file:///cache/out.jpg', 'x'.repeat(4200));
    mockManipulator();

    expect(await normalizeImage('file:///cache/photo.jpg')).toEqual({
      uri: 'file:///cache/out.jpg',
      width: 1448,
      height: 2048,
      size: 4200,
    });
  });

  it('releases the native image and context after saving', async () => {
    const { context, image } = mockManipulator();

    await normalizeImage('file:///cache/photo.jpg');

    expect(image.release).toHaveBeenCalled();
    expect(context.release).toHaveBeenCalled();
  });

  it('rejects and still releases when the image can not be decoded', async () => {
    const { context } = mockManipulator({ render: Promise.reject(new Error('Could not decode')) });

    await expect(normalizeImage('file:///cache/broken.heic')).rejects.toThrow('Could not decode');
    expect(context.release).toHaveBeenCalled();
  });

  it('releases the image when saving fails', async () => {
    const { image } = mockManipulator({ save: Promise.reject(new Error('Disk full')) });

    await expect(normalizeImage('file:///cache/photo.jpg')).rejects.toThrow('Disk full');
    expect(image.release).toHaveBeenCalled();
  });
});
