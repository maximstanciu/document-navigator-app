import { getNotificationPermission, getPushToken } from '@/features/reminders/notifications';
import { isPushToken } from '@/shared/analysis/contract';

/** How long an upload or `PATCH` waits for the token: it comes from Expo's servers (ANL-12). */
export const PUSH_TOKEN_TIMEOUT_MS = 10_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`No answer in ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * The Expo push token for the push about a finished job (ANL-12), or `null`: without the
 * permission, on web, or when the OS gives none in time (no FCM in the build, no Google Play
 * services, no network). Never asks for the permission (REM-5) and never fails: without a token the
 * result comes when the app is open, by polling.
 */
export async function pushTokenIfAllowed(): Promise<string | null> {
  try {
    if ((await getNotificationPermission()) !== 'granted') return null;
    const token = await withTimeout(getPushToken(), PUSH_TOKEN_TIMEOUT_MS);
    return isPushToken(token) ? token : null;
  } catch {
    return null;
  }
}
