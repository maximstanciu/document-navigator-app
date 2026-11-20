import { authenticate, type AuthPrompt, type AuthResult } from './local-auth';

let checks = 0;

/**
 * The system prompt for biometrics or the phone's code (SET-8), for unlocking the app and for
 * turning the lock on or off. Every check goes through here so that the lock can tell the prompt's
 * own trips away from the app (Android's code screen is another activity) from the person leaving.
 */
export async function confirmOwner(prompt: AuthPrompt): Promise<AuthResult> {
  checks += 1;
  try {
    return await authenticate(prompt);
  } finally {
    checks -= 1;
  }
}

/** A prompt from `confirmOwner()` is on screen. */
export function isConfirmingOwner(): boolean {
  return checks > 0;
}
