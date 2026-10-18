import { screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import CaptureRoute from '@/app/capture';
import CaptureLayout from '@/app/capture/_layout';
import { Button } from '@/components/ui/button';
import { i18n } from '@/lib/i18n/i18n';
import { createTestProviders } from '@/test/render';

function Home() {
  return <Button label="Open capture" onPress={() => router.push('/capture')} />;
}

function renderCapture(initialUrl: string) {
  return renderRouter(
    { index: Home, 'capture/_layout': CaptureLayout, 'capture/index': CaptureRoute },
    { initialUrl, wrapper: createTestProviders() }
  );
}

describe('CaptureSourceScreen (CAP-1)', () => {
  it('offers scanning, a photo from the gallery and a file', async () => {
    await renderCapture('/capture');

    for (const name of ['Scan', 'Photo from gallery', 'File']) {
      // Disabled until the scanner (task 2.2) and the pickers (task 2.3) exist.
      expect(await screen.findByRole('button', { name })).toBeDisabled();
    }
    expect(screen.getByText('A PDF or an image from your files')).toBeOnTheScreen();
  });

  it('shows the options in Russian', async () => {
    await i18n.changeLanguage('ru');
    await renderCapture('/capture');

    for (const name of ['Сканировать', 'Фото из галереи', 'Файл', 'Отмена']) {
      expect(await screen.findByRole('button', { name })).toBeOnTheScreen();
    }
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
});
