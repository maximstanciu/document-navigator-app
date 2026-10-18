import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import ReviewRoute from '@/app/capture/review';
import { Button } from '@/components/ui/button';
import { i18n } from '@/lib/i18n/i18n';
import { createTestProviders } from '@/test/render';

import { normalizeImage, type NormalizedImage } from '../normalize-image';
import type { PickedFile } from '../picked-files';
import { pickFile, pickPhotos } from '../pickers';
import { scanDocument } from '../scanner';

jest.mock('../scanner', () => ({ scanDocument: jest.fn() }));
jest.mock('../pickers', () => ({ pickPhotos: jest.fn(), pickFile: jest.fn() }));
jest.mock('../normalize-image', () => ({ normalizeImage: jest.fn() }));
const scan = jest.mocked(scanDocument);
const photos = jest.mocked(pickPhotos);
const pickedFile = jest.mocked(pickFile);
const normalize = jest.mocked(normalizeImage);

const MB = 1024 * 1024;

function picked(...files: Partial<PickedFile>[]) {
  return {
    status: 'picked' as const,
    files: files.map((file, i) => ({
      uri: `file:///cache/picked-${i}.jpg`,
      name: `picked-${i}.jpg`,
      mimeType: 'image/jpeg',
      size: MB,
      ...file,
    })),
  };
}

function Home() {
  return <Button label="Open capture" onPress={() => router.push('/capture')} />;
}

function renderCapture(initialUrl: string) {
  return renderRouter(
    {
      index: Home,
      'capture/_layout': CaptureLayout,
      'capture/index': CaptureRoute,
      'capture/review': ReviewRoute,
    },
    { initialUrl, wrapper: createTestProviders() }
  );
}

/** Every image normalizes to a 400 KB JPEG next to it. */
function normalizesTo(size = 400 * 1024) {
  normalize.mockImplementation(async (uri) => ({
    uri: `${uri}.normalized.jpg`,
    width: 1448,
    height: 2048,
    size,
  }));
}

beforeEach(() => normalizesTo());

afterEach(() => {
  scan.mockReset();
  photos.mockReset();
  pickedFile.mockReset();
  normalize.mockReset();
});

describe('CaptureSourceScreen (CAP-1)', () => {
  it('offers scanning, a photo from the gallery and a file', async () => {
    await renderCapture('/capture');

    expect(await screen.findByRole('button', { name: 'Scan' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Photo from gallery' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'File' })).toBeEnabled();
    expect(screen.getByText('A PDF or an image from your files')).toBeOnTheScreen();
  });

  it('shows the options in Russian', async () => {
    await i18n.changeLanguage('ru');
    await renderCapture('/capture');

    for (const name of ['Сканировать', 'Фото из галереи', 'Файл', 'Отмена']) {
      expect(await screen.findByRole('button', { name })).toBeOnTheScreen();
    }
  });

  it('shows the scanned pages for review (CAP-2)', async () => {
    const user = userEvent.setup();
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg', 'file:///p2.jpg'] });
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Scan' }));

    expect(scan).toHaveBeenCalledWith({ maxPages: 30 });
    // The review shows the pages as they will be uploaded (CAP-4).
    expect(normalize.mock.calls.map(([uri]) => uri)).toEqual(['file:///p1.jpg', 'file:///p2.jpg']);
    expect(screen).toHavePathname('/capture/review');
    expect(await screen.findByText('2 pages')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 1')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 2')).toBeOnTheScreen();
  });

  it('suggests the gallery or a file when the scanner is unavailable (CAP-9)', async () => {
    const user = userEvent.setup();
    scan.mockResolvedValue({ status: 'unavailable' });
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Scan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The scanner isn't available on this device. Add a photo from the gallery or a file instead."
    );
    expect(screen).toHavePathname('/capture');
  });

  it('explains the page limit when the scan has too many pages (CAP-7)', async () => {
    const user = userEvent.setup();
    scan.mockResolvedValue({ status: 'too_many_pages', pageCount: 31 });
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Scan' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A document can have at most 30 pages. Scan it again with fewer pages.'
    );
  });

  it('stays on the choice without a message when the scan is cancelled', async () => {
    const user = userEvent.setup();
    scan.mockResolvedValue({ status: 'cancelled' });
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Scan' }));

    expect(scan).toHaveBeenCalledTimes(1);
    expect(screen).toHavePathname('/capture');
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('shows the photos picked from the gallery for review (CAP-3)', async () => {
    const user = userEvent.setup();
    photos.mockResolvedValue(picked({}, { mimeType: 'image/heic', name: 'IMG_2.HEIC' }));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Photo from gallery' }));

    expect(photos).toHaveBeenCalledWith({ maxPages: 30 });
    expect(screen).toHavePathname('/capture/review');
    expect(await screen.findByText('2 pages')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 2')).toBeOnTheScreen();
  });

  it('explains which photo formats fit when one does not (CAP-3)', async () => {
    const user = userEvent.setup();
    photos.mockResolvedValue(picked({}, { mimeType: 'image/webp', name: 'screen.webp' }));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Photo from gallery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "This photo format isn't supported. Choose JPEG, PNG or HEIC photos."
    );
    expect(screen).toHavePathname('/capture');
  });

  it('explains the page limit when too many photos are picked (CAP-7)', async () => {
    const user = userEvent.setup();
    photos.mockResolvedValue(picked(...Array.from({ length: 31 }, () => ({}))));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Photo from gallery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A document can have at most 30 pages. Choose fewer photos.'
    );
  });

  it('shows a picked PDF with its name and size instead of pages (CAP-5, D-4)', async () => {
    const user = userEvent.setup();
    pickedFile.mockResolvedValue(
      picked({
        uri: 'file:///cache/letter.pdf',
        name: 'Tax letter.pdf',
        mimeType: 'application/pdf',
        size: 1.5 * MB,
      })
    );
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'File' }));

    expect(screen).toHavePathname('/capture/review');
    expect(await screen.findByText('Tax letter.pdf')).toBeOnTheScreen();
    expect(screen.getByText('1.5 MB')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Page 1')).not.toBeOnTheScreen();
  });

  it('takes an image file as a one-page document', async () => {
    const user = userEvent.setup();
    pickedFile.mockResolvedValue(picked({ mimeType: 'image/png', name: 'scan.png' }));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'File' }));

    expect(await screen.findByText('1 page')).toBeOnTheScreen();
  });

  it('refuses a PDF over the size limit before upload (CAP-7)', async () => {
    const user = userEvent.setup();
    pickedFile.mockResolvedValue(
      picked({ name: 'big.pdf', mimeType: 'application/pdf', size: 21 * MB })
    );
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'File' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "The file is larger than 20 MB, so the document can't be analyzed. Compress the PDF or scan the pages you need."
    );
    expect(screen).toHavePathname('/capture');
  });

  it('refuses a file of another type in Russian', async () => {
    const user = userEvent.setup();
    await i18n.changeLanguage('ru');
    pickedFile.mockResolvedValue(picked({ name: 'contract.docx', mimeType: 'application/msword' }));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Файл' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Такой файл не подходит. Выберите PDF или изображение JPEG, PNG или HEIC.'
    );
  });

  it('says so when the picker fails, and stays quiet on a cancel', async () => {
    const user = userEvent.setup();
    pickedFile.mockResolvedValueOnce({ status: 'cancelled' });
    pickedFile.mockResolvedValueOnce({ status: 'failed' });
    await renderCapture('/capture');
    const fileButton = await screen.findByRole('button', { name: 'File' });

    await user.press(fileButton);
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    await user.press(fileButton);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't get the files. Try again."
    );
    expect(screen).toHavePathname('/capture');
  });

  it('shows progress while the pages are prepared, with the sources disabled (CAP-4)', async () => {
    const user = userEvent.setup();
    let finish: (image: NormalizedImage) => void = () => {};
    normalize.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg', 'file:///p2.jpg'] });
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Scan' }));

    expect(await screen.findByText('Preparing the pages: 0 of 2')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Scan' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'File' })).toBeDisabled();
    finish({ uri: 'file:///p1.out.jpg', width: 1448, height: 2048, size: 1 });

    expect(await screen.findByText('2 pages')).toBeOnTheScreen();
    expect(screen).toHavePathname('/capture/review');
  });

  it('explains the size limit when the pages together are too large (CAP-7)', async () => {
    const user = userEvent.setup();
    normalizesTo(11 * MB);
    photos.mockResolvedValue(picked({}, {}));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Photo from gallery' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Together the pages are larger than 20 MB, so the document can't be analyzed. Scan or choose fewer pages."
    );
    expect(screen).toHavePathname('/capture');
    expect(screen.getByRole('button', { name: 'Photo from gallery' })).toBeEnabled();
  });

  it('explains an image that can not be opened', async () => {
    const user = userEvent.setup();
    normalize.mockRejectedValue(new Error('Could not decode'));
    pickedFile.mockResolvedValue(picked({ name: 'IMG_1.HEIC', mimeType: 'image/heic' }));
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'File' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't open the image. Choose another photo or file."
    );
  });

  it('stops preparing the pages when the modal is closed', async () => {
    const user = userEvent.setup();
    let finish: (image: NormalizedImage) => void = () => {};
    normalize.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
    photos.mockResolvedValue(picked({}, {}));
    await renderCapture('/');
    await user.press(await screen.findByRole('button', { name: 'Open capture' }));

    await user.press(await screen.findByRole('button', { name: 'Photo from gallery' }));
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));
    finish({ uri: 'file:///p1.out.jpg', width: 1448, height: 2048, size: 1 });

    expect(await screen.findByRole('button', { name: 'Open capture' })).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it('closes with Cancel and returns to the screen it was opened from', async () => {
    const user = userEvent.setup();
    await renderCapture('/');

    await user.press(await screen.findByRole('button', { name: 'Open capture' }));
    expect(screen).toHavePathname('/capture');
    await user.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen).toHavePathname('/');
  });

  it('goes to the documents on Cancel when opened by a direct link', async () => {
    const user = userEvent.setup();
    await renderCapture('/capture');

    await user.press(await screen.findByRole('button', { name: 'Cancel' }));

    expect(screen).toHavePathname('/');
    expect(await screen.findByRole('button', { name: 'Open capture' })).toBeOnTheScreen();
  });

  it('has no pages to review when the review is opened directly', async () => {
    await renderCapture('/capture/review');

    expect(await screen.findByText('No pages yet')).toBeOnTheScreen();
  });
});
