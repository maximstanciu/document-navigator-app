import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { capturedMimeType, checkPickedFiles, type PickedFile } from './picked-files';

const MB = 1024 * 1024;

function file(overrides: Partial<PickedFile> = {}): PickedFile {
  return {
    uri: 'file:///cache/picked/page.jpg',
    name: 'page.jpg',
    mimeType: 'image/jpeg',
    size: 2 * MB,
    ...overrides,
  };
}

const pdf = (overrides: Partial<PickedFile> = {}) =>
  file({
    uri: 'file:///cache/picked/letter.pdf',
    name: 'letter.pdf',
    mimeType: 'application/pdf',
    ...overrides,
  });

describe('capturedMimeType (CAP-3)', () => {
  it.each([
    ['application/pdf', 'application/pdf'],
    ['image/jpeg', 'image/jpeg'],
    ['image/jpg', 'image/jpeg'],
    ['IMAGE/PNG', 'image/png'],
    ['image/heic', 'image/heic'],
    ['image/heif', 'image/heic'],
  ])('takes the reported type %s as %s', (mimeType, expected) => {
    expect(capturedMimeType(file({ mimeType }))).toBe(expected);
  });

  it.each(['image/webp', 'image/gif', 'application/msword', 'text/plain'])(
    'refuses %s even with an accepted extension',
    (mimeType) => {
      expect(capturedMimeType(file({ mimeType, name: 'page.jpg' }))).toBeNull();
    }
  );

  it.each([null, '', 'application/octet-stream'])(
    'falls back to the extension when the type is %p',
    (mimeType) => {
      expect(capturedMimeType(file({ mimeType, name: 'Scan 12.PDF' }))).toBe('application/pdf');
      expect(capturedMimeType(file({ mimeType, name: 'IMG_0001.HEIC' }))).toBe('image/heic');
    }
  );

  it('reads the extension from the URI when there is no name', () => {
    expect(
      capturedMimeType(file({ mimeType: null, name: null, uri: 'file:///cache/ImagePicker/a.png' }))
    ).toBe('image/png');
  });

  it('refuses a file with no type and an unknown or missing extension', () => {
    expect(capturedMimeType(file({ mimeType: null, name: 'contract.docx' }))).toBeNull();
    expect(
      capturedMimeType(file({ mimeType: null, name: 'README', uri: 'content://x/1' }))
    ).toBeNull();
  });
});

describe('checkPickedFiles (CAP-3, CAP-7)', () => {
  it('turns photos into pages in the order they were picked', () => {
    const photos = [
      file({ uri: 'file:///p1.jpg', name: 'p1.jpg', size: 100 }),
      file({ uri: 'file:///p2.heic', name: 'p2.heic', mimeType: 'image/heic', size: 200 }),
    ];

    expect(checkPickedFiles('gallery', photos)).toEqual({
      status: 'ok',
      pages: [
        { uri: 'file:///p1.jpg', mimeType: 'image/jpeg', size: 100, name: 'p1.jpg' },
        { uri: 'file:///p2.heic', mimeType: 'image/heic', size: 200, name: 'p2.heic' },
      ],
    });
  });

  it('refuses the whole selection when one photo has an unsupported format', () => {
    const photos = [file(), file({ mimeType: 'image/webp', name: 'screen.webp' })];

    expect(checkPickedFiles('gallery', photos)).toEqual({ status: 'unsupported_type' });
  });

  it('allows as many photos as a document has pages, and no more', () => {
    const photos = Array.from({ length: MAX_DOCUMENT_PAGES + 1 }, (_, i) =>
      file({ uri: `file:///p${i}.jpg` })
    );

    expect(checkPickedFiles('gallery', photos.slice(0, MAX_DOCUMENT_PAGES)).status).toBe('ok');
    expect(checkPickedFiles('gallery', photos)).toEqual({
      status: 'too_many_pages',
      pageCount: MAX_DOCUMENT_PAGES + 1,
    });
  });

  it('leaves the size of photos to the check after normalization (CAP-4)', () => {
    const photos = [file({ size: 15 * MB }), file({ uri: 'file:///p2.jpg', size: 15 * MB })];

    expect(checkPickedFiles('gallery', photos).status).toBe('ok');
  });

  it('takes a PDF as the whole document', () => {
    expect(checkPickedFiles('file', [pdf({ size: 3 * MB })])).toEqual({
      status: 'ok',
      pages: [
        {
          uri: 'file:///cache/picked/letter.pdf',
          mimeType: 'application/pdf',
          size: 3 * MB,
          name: 'letter.pdf',
        },
      ],
    });
  });

  it('takes a single image file as a one-page document', () => {
    expect(checkPickedFiles('file', [file({ mimeType: 'image/png', name: 'a.png' })])).toEqual({
      status: 'ok',
      pages: [expect.objectContaining({ mimeType: 'image/png' })],
    });
  });

  it('refuses a PDF over the size limit, which is uploaded as is', () => {
    expect(checkPickedFiles('file', [pdf({ size: MAX_DOCUMENT_BYTES })]).status).toBe('ok');
    expect(checkPickedFiles('file', [pdf({ size: MAX_DOCUMENT_BYTES + 1 })])).toEqual({
      status: 'too_large',
      size: MAX_DOCUMENT_BYTES + 1,
    });
  });

  it('lets a PDF of unknown size through to the server check', () => {
    expect(checkPickedFiles('file', [pdf({ size: null })]).status).toBe('ok');
  });

  it('refuses a PDF from the gallery or together with other files', () => {
    expect(checkPickedFiles('gallery', [pdf()])).toEqual({ status: 'unsupported_type' });
    expect(checkPickedFiles('file', [pdf(), file()])).toEqual({ status: 'unsupported_type' });
  });

  it('refuses a file of another type', () => {
    expect(
      checkPickedFiles('file', [file({ mimeType: 'application/zip', name: 'docs.zip' })])
    ).toEqual({ status: 'unsupported_type' });
  });
});
