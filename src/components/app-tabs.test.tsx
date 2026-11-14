import { screen, userEvent } from '@testing-library/react-native';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import TabLayout from '@/app/(tabs)/_layout';
import { i18n } from '@/lib/i18n/i18n';
import { createTestProviders } from '@/test/render';

function renderTabs(initialUrl = '/') {
  return renderRouter(
    {
      '(tabs)/_layout': TabLayout,
      '(tabs)/index': () => <Text>Documents screen</Text>,
      '(tabs)/deadlines': () => <Text>Deadlines screen</Text>,
      '(tabs)/settings': () => <Text>Settings screen</Text>,
      'capture/index': () => <Text>Capture screen</Text>,
    },
    { initialUrl, wrapper: createTestProviders() }
  );
}

describe('AppTabs', () => {
  it('shows the three tabs with the documents tab chosen', async () => {
    await renderTabs();

    expect(await screen.findByText('Documents screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Documents' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Deadlines' })).not.toBeSelected();
    expect(screen.getByRole('tab', { name: 'Settings' })).not.toBeSelected();
  });

  it('switches tabs', async () => {
    const user = userEvent.setup();
    await renderTabs();

    await user.press(await screen.findByRole('tab', { name: 'Deadlines' }));

    expect(screen).toHavePathname('/deadlines');
    expect(await screen.findByText('Deadlines screen')).toBeOnTheScreen();
    expect(screen.getByRole('tab', { name: 'Deadlines' })).toBeSelected();
    expect(screen.getByRole('tab', { name: 'Documents' })).not.toBeSelected();
  });

  it('opens the choice of source from any tab with «Add a document» (CAP-1)', async () => {
    const user = userEvent.setup();
    await renderTabs('/settings');

    await user.press(await screen.findByRole('button', { name: 'Add a document' }));

    expect(screen).toHavePathname('/capture');
    expect(await screen.findByText('Capture screen')).toBeOnTheScreen();
  });

  it('names the tabs and the button in Russian', async () => {
    await i18n.changeLanguage('ru');
    await renderTabs();

    for (const name of ['Документы', 'Сроки', 'Настройки']) {
      expect(await screen.findByRole('tab', { name })).toBeOnTheScreen();
    }
    expect(screen.getByRole('button', { name: 'Добавить документ' })).toBeOnTheScreen();
  });
});
