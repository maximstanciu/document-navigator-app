import {
  authenticateAsync,
  AuthenticationType,
  getEnrolledLevelAsync,
  SecurityLevel,
  supportedAuthenticationTypesAsync,
  type LocalAuthenticationError,
} from 'expo-local-authentication';

// Adapter for the app lock (SET-8) over expo-local-authentication: the rest of the app sees these
// functions, and tests replace this module (src/test/fake-local-auth.ts). The OS checks the face,
// finger or code itself; the app only learns whether it matched. The web stub is local-auth.web.ts.

/**
 * What the phone unlocks the app with, besides its screen lock code. `faceId` and `touchId` are
 * iPhone names; Android says `face`, `fingerprint`, or `biometrics` when it has more than one kind.
 * `null`: no biometrics set up, only the code.
 */
export type Biometry = 'faceId' | 'touchId' | 'face' | 'fingerprint' | 'biometrics' | null;

export type LockSupport = {
  /** The platform can lock the app at all (not on web). */
  supported: boolean;
  /**
   * The phone has a screen lock (a code, maybe biometrics too). Without one there is nothing to
   * check against, so the app opens unlocked rather than lock its owner out.
   */
  available: boolean;
  biometry: Biometry;
};

/**
 * `success`: it was the owner. `cancel`: the prompt was closed (by the person or the system, e.g.
 * the app left the screen). `lockout`: too many failed tries; the phone itself must be unlocked
 * with its code first. `unavailable`: the phone has no screen lock (any more). `failed`: anything
 * else; trying again may work.
 */
export type AuthResult = 'success' | 'cancel' | 'lockout' | 'unavailable' | 'failed';

export type AuthPrompt = {
  /** The title of the system prompt (iOS: the reason under Face ID or Touch ID). */
  message: string;
  cancelLabel: string;
};

/** The name for the biometrics the phone has hardware for (exported for tests). */
export function biometryOf(types: AuthenticationType[], os: 'ios' | 'android'): Biometry {
  if (os === 'ios') {
    if (types.includes(AuthenticationType.FACIAL_RECOGNITION)) return 'faceId';
    if (types.includes(AuthenticationType.FINGERPRINT)) return 'touchId';
    return null;
  }
  if (types.length > 1) return 'biometrics';
  if (types[0] === AuthenticationType.FINGERPRINT) return 'fingerprint';
  if (types[0] === AuthenticationType.FACIAL_RECOGNITION) return 'face';
  return types.length ? 'biometrics' : null;
}

/** Whether the phone can lock the app now, and with what (read again on every return to the app). */
export async function getLockSupport(): Promise<LockSupport> {
  const level = await getEnrolledLevelAsync();
  if (level === SecurityLevel.NONE) return { supported: true, available: false, biometry: null };
  // Hardware the phone has; enrolled is only known as a level, so a code alone names no biometry.
  const biometry =
    level === SecurityLevel.SECRET
      ? null
      : biometryOf(
          await supportedAuthenticationTypesAsync(),
          process.env.EXPO_OS === 'ios' ? 'ios' : 'android'
        );
  return { supported: true, available: true, biometry };
}

const RESULTS: Record<LocalAuthenticationError, AuthResult> = {
  user_cancel: 'cancel',
  system_cancel: 'cancel',
  app_cancel: 'cancel',
  user_fallback: 'cancel',
  lockout: 'lockout',
  not_enrolled: 'unavailable',
  passcode_not_set: 'unavailable',
  not_available: 'unavailable',
  no_space: 'failed',
  timeout: 'failed',
  unable_to_process: 'failed',
  unknown: 'failed',
  invalid_context: 'failed',
  authentication_failed: 'failed',
};

/**
 * Shows the system prompt: biometrics, with the phone's code as the fallback (after failed tries,
 * or right away on a phone with only a code). Never throws.
 */
export async function authenticate({ message, cancelLabel }: AuthPrompt): Promise<AuthResult> {
  try {
    const result = await authenticateAsync({
      promptMessage: message,
      cancelLabel,
      disableDeviceFallback: false,
      // Android: a recognized face opens the app without a further «Confirm» tap.
      requireConfirmation: false,
    });
    return result.success ? 'success' : (RESULTS[result.error] ?? 'failed');
  } catch {
    // Android rejects when there is no activity (the app is closing) or the prompt broke.
    return 'failed';
  }
}
