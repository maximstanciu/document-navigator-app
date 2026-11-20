import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { appLockKeys } from '@/features/app-lock/queries';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { fakeLocalAuth, release, setUpLock } from '@/test/fake-local-auth';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { AppLockSetting } from './app-lock-setting';

let repositories: Repositories;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
});

afterEach(() => setRepositories(null));

async function renderSetting() {
  return renderWithProviders(<AppLockSetting />);
}

describe('AppLockSetting (SET-8)', () => {
  it('is not offered where the app can’t be locked (web)', async () => {
    const { queryClient } = await renderSetting();

    // Wait for the support check, then nothing is there.
    await waitFor(() =>
      expect(queryClient.getQueryState(appLockKeys.support())?.status).toBe('success')
    );
    expect(screen.queryByRole('heading', { name: 'Security' })).not.toBeOnTheScreen();
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();
  });

  it.each([
    ['faceId', 'Require Face ID'],
    ['touchId', 'Require Touch ID'],
    ['fingerprint', 'Require fingerprint'],
    ['face', 'Require face unlock'],
    ['biometrics', 'Require biometrics'],
  ] as const)('names it after the phone’s biometry: %s', async (biometry, label) => {
    setUpLock(biometry);
    await renderSetting();

    expect(await screen.findByRole('switch', { name: label })).not.toBeChecked();
    expect(screen.getByRole('heading', { name: 'Security' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        "Asked when the app starts and after more than a minute in the background. The phone's screen lock code works too."
      )
    ).toBeOnTheScreen();
  });

  it('asks for the phone’s code on a phone with only a code', async () => {
    setUpLock(null);
    await renderSetting();

    expect(await screen.findByRole('switch', { name: 'Require screen lock' })).toBeOnTheScreen();
    expect(
      screen.getByText(
        "The phone's screen lock code is asked when the app starts and after more than a minute in the background."
      )
    ).toBeOnTheScreen();
  });

  it('turns on only after the owner confirms it in the system prompt', async () => {
    setUpLock('faceId');
    fakeLocalAuth.holding = true;
    await renderSetting();

    await fireEvent(
      await screen.findByRole('switch', { name: 'Require Face ID' }),
      'valueChange',
      true
    );

    // On while the prompt is up, but not stored yet.
    expect(fakeLocalAuth.prompts).toEqual([{ message: 'Turn on app lock', cancelLabel: 'Cancel' }]);
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require Face ID' })).toBeDisabled()
    );
    expect(screen.getByRole('switch', { name: 'Require Face ID' })).toBeChecked();
    expect((await repositories.settings.get()).appLock).toBe(false);

    release();

    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require Face ID' })).toBeEnabled()
    );
    expect(screen.getByRole('switch', { name: 'Require Face ID' })).toBeChecked();
    expect((await repositories.settings.get()).appLock).toBe(true);
  });

  it('stays off after a cancelled prompt and says why after a failed one', async () => {
    setUpLock('fingerprint');
    fakeLocalAuth.results = ['cancel', 'lockout', 'failed'];
    await renderSetting();
    const turnOn = async () =>
      fireEvent(
        await screen.findByRole('switch', { name: 'Require fingerprint' }),
        'valueChange',
        true
      );

    await turnOn();
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Require fingerprint' })).toBeEnabled()
    );
    expect(screen.getByRole('switch', { name: 'Require fingerprint' })).not.toBeChecked();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    await turnOn();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Unlock the phone with its code, then try again.'
    );

    await turnOn();
    expect(await screen.findByText("Couldn't confirm it's you. Try again.")).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Require fingerprint' })).not.toBeChecked();
    expect((await repositories.settings.get()).appLock).toBe(false);
  });

  it('turns off only after the owner confirms it too', async () => {
    await repositories.settings.update({ appLock: true });
    setUpLock('faceId');
    await renderSetting();

    await fireEvent(
      await screen.findByRole('switch', { name: 'Require Face ID' }),
      'valueChange',
      false
    );

    await waitFor(async () => expect((await repositories.settings.get()).appLock).toBe(false));
    expect(fakeLocalAuth.prompts).toEqual([
      { message: 'Turn off app lock', cancelLabel: 'Cancel' },
    ]);
    expect(await screen.findByRole('switch', { name: 'Require Face ID' })).not.toBeChecked();
  });

  it('can’t be turned on without a screen lock on the phone', async () => {
    fakeLocalAuth.support = { supported: true, available: false, biometry: null };
    await renderSetting();

    expect(await screen.findByRole('switch', { name: 'App lock' })).toBeDisabled();
    expect(
      screen.getByText("Set up a screen lock in the phone's settings first.")
    ).toBeOnTheScreen();
  });

  it('says a lock turned on earlier is not checked without a screen lock, and turns it off unasked', async () => {
    await repositories.settings.update({ appLock: true });
    fakeLocalAuth.support = { supported: true, available: false, biometry: null };
    await renderSetting();

    const appLock = await screen.findByRole('switch', { name: 'App lock' });
    expect(appLock).toBeChecked();
    expect(
      screen.getByText(
        "The phone has no screen lock, so the app opens without the check. Set one up in the phone's settings."
      )
    ).toBeOnTheScreen();

    await fireEvent(appLock, 'valueChange', false);

    await waitFor(async () => expect((await repositories.settings.get()).appLock).toBe(false));
    expect(fakeLocalAuth.prompts).toEqual([]);
  });

  it('shows the setting as it now is when the screen lock was removed meanwhile', async () => {
    setUpLock('faceId');
    fakeLocalAuth.results = ['unavailable'];
    await renderSetting();
    await screen.findByRole('switch', { name: 'Require Face ID' });
    fakeLocalAuth.support = { supported: true, available: false, biometry: null };

    await fireEvent(screen.getByRole('switch', { name: 'Require Face ID' }), 'valueChange', true);

    expect(await screen.findByRole('switch', { name: 'App lock' })).toBeDisabled();
    expect((await repositories.settings.get()).appLock).toBe(false);
  });
});
