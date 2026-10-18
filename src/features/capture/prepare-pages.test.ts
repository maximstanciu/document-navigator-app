import { MAX_DOCUMENT_BYTES } from '@/shared/limits';

import { normalizeImage } from './normalize-image';
import { checkDocumentSize, preparePages } from './prepare-pages';
import type { CapturedPage } from './types';

jest.mock('./normalize-image', () => ({ normalizeImage: jest.fn() }));
const normalize = jest.mocked(normalizeImage);

const MB = 1024 * 1024;

function page(uri: string, overrides: Partial<CapturedPage> = {}): CapturedPage {
  return {
    uri,
    mimeType: 'image/jpeg',
    size: null,
    name: null,
    width: null,
    height: null,
    ...overrides,
  };
}

const pdf = (size: number | null) =>
  page('file:///cache/letter.pdf', { mimeType: 'application/pdf', size, name: 'letter.pdf' });

/** Every image normalizes to `<uri>.out.jpg` of the given size. */
function normalizesTo(size: number | null) {
  normalize.mockImplementation(async (uri) => ({
    uri: `${uri}.out.jpg`,
    width: 1448,
    height: 2048,
    size,
  }));
}

afterEach(() => normalize.mockReset());

describe('preparePages (CAP-4)', () => {
  it('normalizes every image to a JPEG, keeping the page order', async () => {
    normalizesTo(400_000);
    const pages = [
      page('file:///scan/1.jpg'),
      page('file:///picked/2.heic', { mimeType: 'image/heic', name: 'IMG_2.HEIC', size: 3 * MB }),
    ];

    expect(await preparePages(pages)).toEqual({
      status: 'ok',
      pages: [
        page('file:///scan/1.jpg.out.jpg', { size: 400_000, width: 1448, height: 2048 }),
        page('file:///picked/2.heic.out.jpg', {
          name: 'IMG_2.HEIC',
          size: 400_000,
          width: 1448,
          height: 2048,
        }),
      ],
    });
    expect(normalize.mock.calls.map(([uri]) => uri)).toEqual([
      'file:///scan/1.jpg',
      'file:///picked/2.heic',
    ]);
  });

  it('keeps a PDF as it is (D-4)', async () => {
    expect(await preparePages([pdf(3 * MB)])).toEqual({ status: 'ok', pages: [pdf(3 * MB)] });
    expect(normalize).not.toHaveBeenCalled();
  });

  it('reports an image that can not be decoded', async () => {
    normalize.mockResolvedValueOnce({ uri: 'file:///1.out.jpg', width: 1, height: 1, size: 1 });
    normalize.mockRejectedValueOnce(new Error('Could not decode'));

    expect(await preparePages([page('file:///1.jpg'), page('file:///2.heic')])).toEqual({
      status: 'unreadable',
    });
  });

  it('reports progress after each page', async () => {
    normalizesTo(1);
    const onProgress = jest.fn();

    await preparePages([page('file:///1.jpg'), pdf(1), page('file:///3.jpg')], { onProgress });

    expect(onProgress.mock.calls).toEqual([[1], [2], [3]]);
  });

  it('stops between pages once aborted', async () => {
    const controller = new AbortController();
    normalize.mockImplementation(async (uri) => {
      controller.abort();
      return { uri, width: 1, height: 1, size: 1 };
    });

    expect(
      await preparePages([page('file:///1.jpg'), page('file:///2.jpg')], {
        signal: controller.signal,
      })
    ).toEqual({ status: 'aborted' });
    expect(normalize).toHaveBeenCalledTimes(1);
  });
});

describe('checkDocumentSize (CAP-7)', () => {
  it('allows a document up to the limit inclusive', () => {
    const half = page('file:///1.jpg', { size: MAX_DOCUMENT_BYTES / 2 });

    expect(checkDocumentSize([half, half])).toEqual({ status: 'ok' });
    expect(checkDocumentSize([half, half, page('file:///3.jpg', { size: 1 })])).toEqual({
      status: 'too_large',
      size: MAX_DOCUMENT_BYTES + 1,
    });
  });

  it('refuses a PDF over the limit, which is uploaded as is', () => {
    expect(checkDocumentSize([pdf(MAX_DOCUMENT_BYTES + 1)])).toEqual({
      status: 'too_large',
      size: MAX_DOCUMENT_BYTES + 1,
    });
  });

  it('counts a page of unknown size as zero and leaves it to the server', () => {
    expect(checkDocumentSize([pdf(null), page('file:///1.jpg')])).toEqual({ status: 'ok' });
  });
});
