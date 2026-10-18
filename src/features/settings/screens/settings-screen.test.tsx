import { screen, userEvent } from '@testing-library/react-native';

import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { LanguageSync } from '@/providers/language-sync';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { SettingsScreen } from './settings-screen';

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
});

afterEach(() => {
  setRepositories(null);
});

function renderSettings() {
  return renderWithProviders(
    <>
      <LanguageSync />
      <SettingsScreen />
    </>
  );
}

describe('SettingsScreen language (SET-1)', () => {
  it('switches the interface to Russian and stores the choice', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(await screen.findByRole('radio', { name: 'Русский' }));

    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked();
    expect((await repositories.settings.get()).locale).toBe('ru');
    expect(i18n.language).toBe('ru');
  });

  it('starts from the stored choice', async () => {
    await repositories.settings.update({ locale: 'ru' });

    await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked();
  });

  it('follows the device language with "System default"', async () => {
    const user = userEvent.setup();
    await repositories.settings.update({ locale: 'ru' });
    await renderSettings();

    await user.press(await screen.findByRole('radio', { name: 'Как в системе' }));

    // The test device language is English.
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeOnTheScreen();
    expect((await repositories.settings.get()).locale).toBe('system');
  });
});
