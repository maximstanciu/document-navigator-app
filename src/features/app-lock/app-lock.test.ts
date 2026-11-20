import { createAppLock, LOCK_AFTER_BACKGROUND_MS, type AppLockDeps } from './app-lock';
import type { AuthResult } from './local-auth';

/** A lock over a fake prompt that reports `results` in order, and a clock the test moves. */
function setUp(overrides: Partial<AppLockDeps> & { results?: AuthResult[] } = {}) {
  const { results = [], ...deps } = overrides;
  let time = 1_000_000;
  let enabled = deps.lockedAtLaunch ?? true;
  let authenticating = false;
  let pending: ((result: AuthResult) => void) | null = null;
  const authenticate = jest.fn(async () => {
    const next = results.shift();
    if (next) return next;
    // No result given: the prompt stays on screen until the test answers it.
    authenticating = true;
    const result = await new Promise<AuthResult>((resolve) => (pending = resolve));
    authenticating = false;
    return result;
  });
  const isAvailable = jest.fn(async () => true);
  const lock = createAppLock({
    lockedAtLaunch: true,
    isEnabled: () => enabled,
    authenticate,
    isAuthenticating: () => authenticating,
    isAvailable,
    now: () => time,
    ...deps,
  });
  return {
    lock,
    authenticate,
    isAvailable,
    advance: (ms: number) => (time += ms),
    setEnabled: (value: boolean) => (enabled = value),
    /** Answers the prompt on screen. */
    answer: async (result: AuthResult) => {
      pending?.(result);
      pending = null;
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

/** Lets the promise chains of a prompt that answered at once run to the end. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('createAppLock', () => {
  it('starts open with the lock off and never asks', async () => {
    const { lock, authenticate } = setUp({ lockedAtLaunch: false });

    expect(lock.getSnapshot()).toEqual({ phase: 'unlocked', status: 'idle', opened: true });
    await lock.unlock();
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('starts locked with nothing opened, and opens once the owner is confirmed', async () => {
    const { lock } = setUp({ results: ['success'] });
    expect(lock.getSnapshot()).toEqual({ phase: 'locked', status: 'idle', opened: false });

    await lock.unlock();

    expect(lock.getSnapshot()).toEqual({ phase: 'unlocked', status: 'idle', opened: true });
  });

  it('shows one prompt at a time and says it is checking meanwhile', async () => {
    const { lock, authenticate, answer } = setUp();

    void lock.unlock();
    void lock.unlock();
    expect(lock.getSnapshot().status).toBe('checking');
    expect(authenticate).toHaveBeenCalledTimes(1);

    await answer('success');
    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('stays locked after a cancel, a lockout or an error, and tries again on «Unlock»', async () => {
    const { lock } = setUp({ results: ['cancel', 'lockout', 'failed', 'success'] });

    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'idle' });
    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'lockout' });
    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'failed' });
    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'unlocked', status: 'idle' });
  });

  it('opens on a phone whose screen lock was removed, rather than lock the owner out', async () => {
    const { lock, isAvailable } = setUp({ results: ['unavailable'] });
    isAvailable.mockResolvedValue(false);

    await lock.unlock();

    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('stays locked when the prompt says unavailable but the phone still has a screen lock', async () => {
    const { lock, isAvailable } = setUp({ results: ['unavailable', 'unavailable'] });
    isAvailable.mockRejectedValueOnce(new Error('native error'));

    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'failed' });

    isAvailable.mockResolvedValue(true);
    await lock.unlock();
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'failed' });
  });

  it('covers the app in the background and uncovers it if back within a minute', async () => {
    const { lock, authenticate, advance } = setUp({ results: ['success'] });
    await lock.unlock();

    lock.appStateChanged('background');
    expect(lock.getSnapshot().phase).toBe('covered');
    advance(LOCK_AFTER_BACKGROUND_MS - 1);
    lock.appStateChanged('active');

    expect(lock.getSnapshot().phase).toBe('unlocked');
    expect(authenticate).toHaveBeenCalledTimes(1);
  });

  it('asks again when back after a minute or more', async () => {
    const { lock, authenticate, advance } = setUp({ results: ['success', 'success'] });
    await lock.unlock();

    lock.appStateChanged('background');
    advance(LOCK_AFTER_BACKGROUND_MS);
    lock.appStateChanged('active');
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', opened: true });
    expect(authenticate).toHaveBeenCalledTimes(2);

    await settle();
    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('counts a clock turned back while away as long away', async () => {
    const { lock, advance } = setUp({ results: ['success'] });
    await lock.unlock();

    lock.appStateChanged('background');
    advance(-10_000);
    lock.appStateChanged('active');

    expect(lock.getSnapshot().phase).toBe('locked');
  });

  it('asks again on return to a lock left unopened, e.g. after cancelling', async () => {
    const { lock, authenticate } = setUp({ results: ['cancel', 'success'] });
    await lock.unlock();

    lock.appStateChanged('background');
    lock.appStateChanged('active');

    expect(authenticate).toHaveBeenCalledTimes(2);
    await settle();
    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('ignores the trips away a prompt makes itself, so a cancel is not asked again', async () => {
    const { lock, authenticate, advance, answer } = setUp();
    void lock.unlock();

    // Android's screen for the phone's code is another activity: the app goes and comes back.
    lock.appStateChanged('background');
    advance(LOCK_AFTER_BACKGROUND_MS * 2);
    await answer('cancel');
    lock.appStateChanged('active');

    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(lock.getSnapshot()).toMatchObject({ phase: 'locked', status: 'idle' });
  });

  it('changes nothing when iOS only makes the app inactive (the prompt, Control Center)', async () => {
    const { lock } = setUp({ results: ['success'] });
    await lock.unlock();

    lock.appStateChanged('inactive');

    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('follows the setting as it is when the app leaves: off, it never covers', async () => {
    const { lock, setEnabled, advance } = setUp({ results: ['success'] });
    await lock.unlock();

    setEnabled(false);
    lock.appStateChanged('background');
    advance(LOCK_AFTER_BACKGROUND_MS * 10);
    lock.appStateChanged('active');

    expect(lock.getSnapshot().phase).toBe('unlocked');
  });

  it('covers once the lock is turned on without asking right away', async () => {
    const { lock, setEnabled, advance } = setUp({ lockedAtLaunch: false });
    setEnabled(true);

    lock.appStateChanged('background');
    expect(lock.getSnapshot().phase).toBe('covered');
    advance(LOCK_AFTER_BACKGROUND_MS);
    lock.appStateChanged('active');

    expect(lock.getSnapshot().phase).toBe('locked');
  });

  it('tells subscribers about every change until they unsubscribe', async () => {
    const { lock } = setUp({ results: ['success'] });
    const listener = jest.fn();
    const unsubscribe = lock.subscribe(listener);

    await lock.unlock();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    lock.appStateChanged('background');
    expect(listener).toHaveBeenCalledTimes(2);
  });
});
