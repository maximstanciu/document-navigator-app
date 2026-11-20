import { screen, userEvent, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import { AppState, Pressable, Text, type AppStateStatus } from 'react-native';

import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { fakeLocalAuth, release, setUpLock } from '@/test/fake-local-auth';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { LOCK_AFTER_BACKGROUND_MS } from '../app-lock';
import { AppLock } from './app-lock';

let repositories: Repositories;
let appStateListeners: ((status: AppStateStatus) => void)[] = [];
let now = Date.parse('2026-11-20T10:00:00Z');

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    appStateListeners.push(listener);
    return { remove: () => (appStateListeners = appStateListeners.filter((l) => l !== listener)) };
  });
  jest.spyOn(Date, 'now').mockImplementation(() => now);
});

afterEach(() => {
  jest.restoreAllMocks();
  setRepositories(null);
});

const changeAppState = (status: AppStateStatus) => {
  for (const listener of appStateListeners) listener(status);
};

/** Stands in for the app's screens: a press count shows whether they stayed mounted. */
function Screens() {
  const [presses, setPresses] = useState(0);
  return (
    <Pressable role="button" aria-label="Press" onPress={() => setPresses(presses + 1)}>
      <Text>Documents, pressed {presses}</Text>
    </Pressable>
  );
}

async function renderApp() {
  return renderWithProviders(
    <AppLock>
      <Screens />
    </AppLock>
  );
}

describe('AppLock (SET-8)', () => {
  it('shows the app at once with the lock off', async () => {
    await renderApp();

    expect(await screen.findByText('Documents, pressed 0')).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: 'App locked' })).not.toBeOnTheScreen();
    expect(fakeLocalAuth.prompts).toEqual([]);
  });

  it('shows only the lock at launch and asks at once; the app mounts once confirmed', async () => {
    await repositories.settings.update({ appLock: true });
    setUpLock('faceId');
    fakeLocalAuth.holding = true;
    await renderApp();

    expect(await screen.findByRole('heading', { name: 'App locked' })).toBeOnTheScreen();
    expect(screen.getByText("Confirm it's you to open your documents.")).toBeOnTheScreen();
    expect(screen.queryByText(/^Documents/)).not.toBeOnTheScreen();
    await waitFor(() =>
      expect(fakeLocalAuth.prompts).toEqual([
        { message: 'Unlock DocNavigator', cancelLabel: 'Cancel' },
      ])
    );
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();

    release();

    expect(await screen.findByText('Documents, pressed 0')).toBeOnTheScreen();
    expect(screen.queryByRole('heading', { name: 'App locked' })).not.toBeOnTheScreen();
  });

  it('stays locked after a cancel until «Unlock» confirms the owner', async () => {
    await repositories.settings.update({ appLock: true });
    setUpLock('fingerprint');
    fakeLocalAuth.results = ['cancel', 'success'];
    const user = userEvent.setup();
    await renderApp();

    const unlock = await screen.findByRole('button', { name: 'Unlock' });
    await waitFor(() => expect(unlock).toBeEnabled());
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();

    await user.press(unlock);

    expect(await screen.findByText('Documents, pressed 0')).toBeOnTheScreen();
    expect(fakeLocalAuth.prompts).toHaveLength(2);
  });

  it('says why a try failed', async () => {
    await repositories.settings.update({ appLock: true });
    setUpLock('faceId');
    fakeLocalAuth.results = ['lockout', 'failed'];
    const user = userEvent.setup();
    await renderApp();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Too many attempts. Unlock the phone with its code, then try again.'
    );
    await user.press(screen.getByRole('button', { name: 'Unlock' }));
    expect(await screen.findByText("Couldn't confirm it's you. Try again.")).toBeOnTheScreen();
    expect(screen.queryByText(/^Documents/)).not.toBeOnTheScreen();
  });

  it('opens on a phone whose screen lock was removed', async () => {
    await repositories.settings.update({ appLock: true });
    fakeLocalAuth.support = { supported: true, available: false, biometry: null };
    fakeLocalAuth.results = ['unavailable'];
    await renderApp();

    expect(await screen.findByText('Documents, pressed 0')).toBeOnTheScreen();
  });

  it('covers the app in the background and keeps its screens as they were', async () => {
    await repositories.settings.update({ appLock: true });
    setUpLock('faceId');
    const user = userEvent.setup();
    await renderApp();
    await user.press(await screen.findByRole('button', { name: 'Press' }));
    expect(screen.getByText('Documents, pressed 1')).toBeOnTheScreen();

    // Away for less than a minute: covered meanwhile, open again on return without asking.
    await waitFor(() => expect(appStateListeners.length).toBeGreaterThan(0));
    changeAppState('background');
    expect(await screen.findByRole('heading', { name: 'App locked' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Unlock' })).toBeDisabled();
    now += LOCK_AFTER_BACKGROUND_MS - 1;
    changeAppState('active');

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'App locked' })).not.toBeOnTheScreen()
    );
    expect(fakeLocalAuth.prompts).toHaveLength(1);

    // Away for a minute: asks again, and the screens beneath are still the same.
    fakeLocalAuth.holding = true;
    changeAppState('background');
    now += LOCK_AFTER_BACKGROUND_MS;
    changeAppState('active');

    await waitFor(() => expect(fakeLocalAuth.prompts).toHaveLength(2));
    expect(screen.getByRole('heading', { name: 'App locked' })).toBeOnTheScreen();
    release();
    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'App locked' })).not.toBeOnTheScreen()
    );
    expect(screen.getByText('Documents, pressed 1')).toBeOnTheScreen();
  });

  it('never covers once the lock is turned off', async () => {
    await renderApp();
    await screen.findByText('Documents, pressed 0');

    changeAppState('background');
    now += LOCK_AFTER_BACKGROUND_MS * 10;
    changeAppState('active');

    expect(screen.queryByRole('heading', { name: 'App locked' })).not.toBeOnTheScreen();
    expect(fakeLocalAuth.prompts).toEqual([]);
  });
});
