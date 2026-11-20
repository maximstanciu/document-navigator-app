import type { AppStateStatus } from 'react-native';

import type { AuthResult } from './local-auth';

/** Back after less than this in the background, the app opens without asking again (SET-8). */
export const LOCK_AFTER_BACKGROUND_MS = 60_000;

/**
 * `unlocked`: the app is on screen. `covered`: it is in the background with the lock on, hidden
 * from the app switcher and from the first frame on return, but not yet asking. `locked`: it asks.
 */
export type LockPhase = 'unlocked' | 'covered' | 'locked';

/** The last try to unlock: none yet or cancelled, on screen now, too many tries, or another error. */
export type UnlockStatus = 'idle' | 'checking' | 'lockout' | 'failed';

export type AppLockState = {
  phase: LockPhase;
  status: UnlockStatus;
  /**
   * The app's screens have been shown since launch. Until then a lock renders nothing else: no
   * screen, link or notification handler runs before the owner is confirmed.
   */
  opened: boolean;
};

export type AppLockDeps = {
  /** The lock was on at launch. */
  lockedAtLaunch: boolean;
  /** Whether the lock is on now; read each time the app leaves the screen. */
  isEnabled: () => boolean;
  /** The system prompt (`confirmOwner()`). */
  authenticate: () => Promise<AuthResult>;
  /** A system prompt is on screen; the app's state changes it causes are not the person leaving. */
  isAuthenticating: () => boolean;
  /** The phone still has a screen lock (`getLockSupport().available`). */
  isAvailable: () => Promise<boolean>;
  now?: () => number;
};

/**
 * The app lock (SET-8) as a small store, without React: what to show follows the app's state
 * (`AppState`) and the result of each prompt. At launch with the lock on it asks at once. Leaving
 * the app covers it; back within a minute it uncovers, later it asks again. The time away is wall
 * clock time, since a monotonic clock may stop while the phone sleeps; a clock turned back counts
 * as long away.
 *
 * A phone without a screen lock (any more) opens the app: there is nothing to check against, and
 * whoever holds such a phone can read it anyway, while the owner would be locked out for good.
 */
export function createAppLock({
  lockedAtLaunch,
  isEnabled,
  authenticate,
  isAuthenticating,
  isAvailable,
  now = Date.now,
}: AppLockDeps) {
  let state: AppLockState = lockedAtLaunch
    ? { phase: 'locked', status: 'idle', opened: false }
    : { phase: 'unlocked', status: 'idle', opened: true };
  let backgroundAt: number | null = null;
  const listeners = new Set<() => void>();

  function set(patch: Partial<AppLockState>) {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  }

  function open() {
    set({ phase: 'unlocked', status: 'idle', opened: true });
  }

  /** Shows the prompt if the app is locked and none is on screen; opens the app on success. */
  async function unlock(): Promise<void> {
    if (state.phase !== 'locked' || state.status === 'checking') return;
    set({ status: 'checking' });
    const result = await authenticate();
    if (state.phase !== 'locked') return;
    if (result === 'success') return open();
    if (result === 'unavailable' && !(await isAvailable().catch(() => true))) return open();
    if (result === 'cancel') return set({ status: 'idle' });
    set({ status: result === 'lockout' ? 'lockout' : 'failed' });
  }

  /** `AppState`'s `change` listener. `inactive` (iOS: the prompt, Control Center) changes nothing. */
  function appStateChanged(appState: AppStateStatus) {
    // The prompt's own trips away and back, e.g. Android's screen for the phone's code. Ignoring
    // them also means a cancelled prompt is not shown again by itself on return.
    if (isAuthenticating()) return;
    if (appState === 'background') {
      if (!isEnabled()) return;
      backgroundAt = now();
      if (state.phase === 'unlocked') set({ phase: 'covered' });
    } else if (appState === 'active') {
      if (backgroundAt === null) return;
      const away = now() - backgroundAt;
      backgroundAt = null;
      if (state.phase === 'covered') {
        if (away >= 0 && away < LOCK_AFTER_BACKGROUND_MS) return set({ phase: 'unlocked' });
        set({ phase: 'locked', status: 'idle' });
      }
      void unlock();
    }
  }

  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    unlock,
    appStateChanged,
  };
}

export type AppLock = ReturnType<typeof createAppLock>;
