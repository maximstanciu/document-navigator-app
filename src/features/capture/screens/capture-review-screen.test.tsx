import { act, fireEvent, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import ReviewRoute from '@/app/capture/review';
import DocumentRoute from '@/app/documents/[id]';
import { Button } from '@/components/ui/button';
import { analyzeDocument } from '@/features/analysis/api';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { fakeFileSystem } from '@/test/fake-file-system';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { normalizeImage } from '../normalize-image';
import type { PickedFile } from '../picked-files';
import { pickFile, pickPhotos } from '../pickers';
import { scanDocument } from '../scanner';

jest.mock('../scanner', () => ({ scanDocument: jest.fn(), SCANNER_SUPPORTED: true }));
jest.mock('../pickers', () => ({ pickPhotos: jest.fn(), pickFile: jest.fn() }));
jest.mock('../normalize-image', () => ({ normalizeImage: jest.fn() }));
// The analysis itself is tested in features/analysis; here it only has to be started.
jest.mock('@/features/analysis/api', () => ({ analyzeDocument: jest.fn(async () => {}) }));
jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
let mockUuidCounter = 0;
jest.mock('expo-crypto', () => ({ randomUUID: () => `uuid-${++mockUuidCounter}` }));

const scan = jest.mocked(scanDocument);
const photos = jest.mocked(pickPhotos);
const pickedFile = jest.mocked(pickFile);
const normalize = jest.mocked(normalizeImage);
const analyze = jest.mocked(analyzeDocument);

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

/** Every image normalizes to a JPEG of `size` bytes next to it, as a real file in the cache. */
function normalizesTo(size = 400 * 1024) {
  normalize.mockImplementation(async (uri) => {
    const out = `${uri}.normalized.jpg`;
    fakeFileSystem.addFile(out);
    return { uri: out, width: 1448, height: 2048, size };
  });
}

/** The file shown as page `number` of the review. */
function shownFile(number: number) {
  const [image] = screen.getByLabelText(`Page ${number}`).children;
  return typeof image === 'string' ? undefined : image?.props.source[0].uri;
}

function Home() {
  return <Button label="Open capture" onPress={() => router.push('/capture')} />;
}

function renderCapture() {
  return renderRouter(
    {
      index: Home,
      'capture/_layout': CaptureLayout,
      'capture/index': CaptureRoute,
      'capture/review': ReviewRoute,
      'documents/[id]': DocumentRoute,
    },
    { initialUrl: '/', wrapper: createTestProviders() }
  );
}

/** Opens the capture modal from the home screen and adds pages from `source`. */
async function captureFrom(source: string) {
  const user = userEvent.setup();
  await renderCapture();
  await user.press(await screen.findByRole('button', { name: 'Open capture' }));
  await user.press(await screen.findByRole('button', { name: source }));
  return user;
}

let repositories: Repositories;

beforeEach(async () => {
  mockUuidCounter = 0;
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  normalizesTo();
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
  scan.mockReset();
  photos.mockReset();
  pickedFile.mockReset();
  normalize.mockReset();
  analyze.mockClear();
});

describe('CaptureReviewScreen (CAP-5)', () => {
  it('removes a page and numbers the rest again', async () => {
    scan.mockResolvedValue({
      status: 'scanned',
      pages: ['file:///p1.jpg', 'file:///p2.jpg', 'file:///p3.jpg'],
    });
    const user = await captureFrom('Scan');
    expect(await screen.findByText('3 pages')).toBeOnTheScreen();

    await user.press(screen.getByRole('button', { name: 'Remove page 2' }));

    expect(await screen.findByText('2 pages')).toBeOnTheScreen();
    expect(shownFile(2)).toBe('file:///p3.jpg.normalized.jpg');
    expect(screen.queryByRole('button', { name: 'Remove page 3' })).not.toBeOnTheScreen();
  });

  it('scans more pages and adds them after the existing ones, within the page limit', async () => {
    scan.mockResolvedValueOnce({ status: 'scanned', pages: ['file:///p1.jpg', 'file:///p2.jpg'] });
    scan.mockResolvedValueOnce({ status: 'scanned', pages: ['file:///p3.jpg'] });
    const user = await captureFrom('Scan');

    await user.press(await screen.findByRole('button', { name: 'Scan more' }));

    expect(await screen.findByText('3 pages')).toBeOnTheScreen();
    expect(scan).toHaveBeenLastCalledWith({ maxPages: 28 });
    expect(shownFile(3)).toBe('file:///p3.jpg.normalized.jpg');
  });

  it('adds more photos after photos from the gallery', async () => {
    photos.mockResolvedValueOnce(picked({}, {}));
    photos.mockResolvedValueOnce(picked({ uri: 'file:///cache/more.jpg' }));
    const user = await captureFrom('Photo from gallery');

    await user.press(await screen.findByRole('button', { name: 'Add more photos' }));

    expect(await screen.findByText('3 pages')).toBeOnTheScreen();
    expect(photos).toHaveBeenLastCalledWith({ maxPages: 28 });
  });

  it('keeps the pages and explains the limit when added pages make the document too large', async () => {
    normalizesTo(8 * MB);
    photos.mockResolvedValueOnce(picked({}, {}));
    photos.mockResolvedValueOnce(picked({ uri: 'file:///cache/more.jpg' }));
    const user = await captureFrom('Photo from gallery');

    await user.press(await screen.findByRole('button', { name: 'Add more photos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Together the pages are larger than 20 MB, so the document can't be analyzed. Scan or choose fewer pages."
    );
    expect(screen.getByText('2 pages')).toBeOnTheScreen();
  });

  it('saves a draft, starts its analysis and opens it in place of the capture modal (SPEC §6.3)', async () => {
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg', 'file:///p2.jpg'] });
    const user = await captureFrom('Scan');

    await user.press(await screen.findByRole('button', { name: 'Analyze the document' }));

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    expect(screen).toHavePathname('/documents/uuid-1');
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledWith('uuid-1', expect.any(Function));
    expect(await repositories.documents.get('uuid-1')).toMatchObject({
      status: 'draft',
      source: 'scan',
      pageCount: 2,
    });
    expect(await repositories.pages.listByDocument('uuid-1')).toHaveLength(2);

    // «Back» from the document leads to the list, not to the capture modal.
    await act(() => router.back());
    expect(screen).toHavePathname('/');
  });

  it('saves a PDF without offering more pages', async () => {
    fakeFileSystem.addFile('file:///cache/letter.pdf');
    pickedFile.mockResolvedValue(
      picked({ uri: 'file:///cache/letter.pdf', name: 'letter.pdf', mimeType: 'application/pdf' })
    );
    const user = await captureFrom('File');

    expect(await screen.findByText('letter.pdf')).toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Scan more' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: 'Add more photos' })).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Analyze the document' }));

    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    expect(await repositories.documents.get('uuid-1')).toMatchObject({
      mimeType: 'application/pdf',
      pageCount: null,
    });
  });

  it('explains when the draft can not be saved and lets the person try again', async () => {
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg'] });
    jest.spyOn(repositories.documents, 'create').mockRejectedValueOnce(new Error('disk I/O error'));
    const user = await captureFrom('Scan');
    const analyze = await screen.findByRole('button', { name: 'Analyze the document' });

    await user.press(analyze);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the document. Try again."
    );
    expect(screen).toHavePathname('/capture/review');
    expect(analyzeDocument).not.toHaveBeenCalled();
    await user.press(analyze);
    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
  });

  it('can not analyze once every page is removed', async () => {
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg'] });
    const user = await captureFrom('Scan');

    await user.press(await screen.findByRole('button', { name: 'Remove page 1' }));

    expect(await screen.findByText('No pages yet')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Analyze the document' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Scan more' })).toBeEnabled();
  });

  it('offers the actions in Russian', async () => {
    await i18n.changeLanguage('ru');
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg'] });
    await captureFrom('Сканировать');

    for (const name of ['Доснять ещё', 'Разобрать документ', 'Удалить страницу 1']) {
      expect(await screen.findByRole('button', { name })).toBeOnTheScreen();
    }
  });
});

describe('CaptureReviewScreen page order (CAP-6)', () => {
  const scanned = ['file:///p1.jpg', 'file:///p2.jpg', 'file:///p3.jpg'];
  const normalized = (n: number) => `file:///p${n}.jpg.normalized.jpg`;

  beforeEach(() => {
    scan.mockResolvedValue({ status: 'scanned', pages: scanned });
  });

  it('moves a page with the screen reader actions and says where it is now', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    await captureFrom('Scan');
    expect(await screen.findByText('3 pages')).toBeOnTheScreen();
    expect(screen.getByLabelText('Page 1')).toHaveProp('accessibilityActions', [
      { name: 'moveLater', label: 'Move later' },
    ]);
    expect(screen.getByLabelText('Page 3')).toHaveProp('accessibilityActions', [
      { name: 'moveEarlier', label: 'Move earlier' },
    ]);

    await fireEvent(screen.getByLabelText('Page 1'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveLater' },
    });

    expect([1, 2, 3].map(shownFile)).toEqual([normalized(2), normalized(1), normalized(3)]);
    expect(announce).toHaveBeenLastCalledWith('Now page 2');

    await fireEvent(screen.getByLabelText('Page 3'), 'accessibilityAction', {
      nativeEvent: { actionName: 'moveEarlier' },
    });

    expect([1, 2, 3].map(shownFile)).toEqual([normalized(2), normalized(3), normalized(1)]);
    expect(announce).toHaveBeenLastCalledWith('Now page 2');
  });

  it('drags a held page to another place, and the draft keeps the new order', async () => {
    // Each page normalizes to its own width, so the saved order shows in the database.
    normalize.mockImplementation(async (uri) => {
      const out = `${uri}.normalized.jpg`;
      fakeFileSystem.addFile(out);
      return { uri: out, width: 1000 + Number(/p(\d)/.exec(uri)?.[1]), height: 2048, size: 1024 };
    });
    const user = await captureFrom('Scan');
    expect(await screen.findByText('3 pages')).toBeOnTheScreen();
    // The grid is 344 pt wide: cells of 109.3 pt with 8 pt between them.
    await fireEvent(screen.getByLabelText('Page 1'), 'layout', {
      nativeEvent: { layout: { x: 0, y: 120, width: 344, height: 0 } },
    });

    // Held, then two cells to the right: over the third page.
    await act(async () => {
      fireGestureHandler(getByGestureTestId(`drag-page-${normalized(1)}`), [
        { state: State.BEGAN, x: 50, y: 50 },
        { state: State.ACTIVE, x: 50, y: 50, translationX: 0, translationY: 0 },
        { state: State.ACTIVE, x: 50, y: 50, translationX: 235, translationY: 10 },
        { state: State.END, x: 50, y: 50, translationX: 235, translationY: 10 },
      ]);
      // The drop reaches React in a microtask, which renderRouter's fake timers hold back.
      jest.runAllTicks();
    });

    await screen.findByText('3 pages');
    expect([1, 2, 3].map(shownFile)).toEqual([normalized(2), normalized(3), normalized(1)]);

    await user.press(screen.getByRole('button', { name: 'Analyze the document' }));
    expect(await screen.findByText("This document hasn't been analyzed yet.")).toBeOnTheScreen();
    const pages = await repositories.pages.listByDocument('uuid-1');
    expect(pages.map((page) => page.width)).toEqual([1002, 1003, 1001]);
  });

  it('explains how to change the order only when there is more than one page', async () => {
    scan.mockResolvedValue({ status: 'scanned', pages: ['file:///p1.jpg'] });
    await captureFrom('Scan');

    expect(await screen.findByText('1 page')).toBeOnTheScreen();
    expect(
      screen.queryByText('To change the order, hold a page and drag it')
    ).not.toBeOnTheScreen();
    expect(screen.getByLabelText('Page 1')).toHaveProp('accessibilityActions', []);
  });
});
