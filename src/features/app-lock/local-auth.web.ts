import type { AuthPrompt, AuthResult, LockSupport } from './local-auth';

export type { AuthPrompt, AuthResult, Biometry, LockSupport } from './local-auth';

// Web is a development preview without biometrics or a screen lock: the app lock is not offered.

export async function getLockSupport(): Promise<LockSupport> {
  return { supported: false, available: false, biometry: null };
}

/** Never called: the setting is hidden, so the lock is never on. */
export async function authenticate(_prompt: AuthPrompt): Promise<AuthResult> {
  return 'unavailable';
}
