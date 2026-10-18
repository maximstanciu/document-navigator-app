import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import ReviewRoute from '@/app/capture/review';
import { Button } from '@/components/ui/button';
import { i18n } from '@/lib/i18n/i18n';
import { createTestProviders } from '@/test/render';

import { scanDocument } from '../scanner';

jest.mock('../scanner', () => ({ scanDocument: jest.fn() }));
const scan = jest.mocked(scanDocument);

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

afterEach(() => scan.mockReset());

describe('CaptureSourceScreen (CAP-1)', () => {
  it('offers scanning, a photo from the gallery and a file', async () => {
    await renderCapture('/capture');

    expect(await screen.findByRole('button', { name: 'Scan' })).toBeEnabled();
    // Disabled until the pickers exist (task 2.3).
    expect(screen.getByRole('button', { name: 'Photo from gallery' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'File' })).toBeDisabled();
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
