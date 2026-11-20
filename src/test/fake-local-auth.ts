// Test-only: the app lock's adapter (`@/features/app-lock/local-auth`) over an in-memory OS. Every
// test gets it (src/test/setup-native-modules.ts) without a lock, as on web; a test that needs one
// sets `fakeLocalAuth.support`.
import type { AuthPrompt, AuthResult, LockSupport } from '@/features/app-lock/local-auth';

export type { AuthPrompt, AuthResult, Biometry, LockSupport } from '@/features/app-lock/local-auth';

export const fakeLocalAuth = {
  /** What `getLockSupport()` reports. */
  support: { supported: false, available: false, biometry: null } as LockSupport,
  /** What the next prompts report, in order; `success` once they run out. */
  results: [] as AuthResult[],
  /**
   * While set, prompts stay on screen until `release()` (the person hasn't looked or touched
   * yet), then report the next result.
   */
  holding: false,
  /** The prompts shown, in order. */
  prompts: [] as AuthPrompt[],
};

let held: (() => void)[] = [];

/** The phone has a screen lock with this biometry (or only a code, with `null`). */
export function setUpLock(biometry: LockSupport['biometry'] = 'faceId') {
  fakeLocalAuth.support = { supported: true, available: true, biometry };
}

/** Lets every held prompt report its result. */
export function release() {
  const waiting = held;
  held = [];
  for (const resume of waiting) resume();
}

export const getLockSupport = jest.fn(async (): Promise<LockSupport> => fakeLocalAuth.support);

export const authenticate = jest.fn(async (prompt: AuthPrompt): Promise<AuthResult> => {
  fakeLocalAuth.prompts.push(prompt);
  if (fakeLocalAuth.holding) await new Promise<void>((resume) => held.push(resume));
  return fakeLocalAuth.results.shift() ?? 'success';
});

/** A fresh OS without a screen lock and clean call records; runs before every test. */
export function resetFakeLocalAuth() {
  fakeLocalAuth.support = { supported: false, available: false, biometry: null };
  fakeLocalAuth.results = [];
  fakeLocalAuth.holding = false;
  fakeLocalAuth.prompts = [];
  held = [];
  getLockSupport.mockClear();
  authenticate.mockClear();
}
