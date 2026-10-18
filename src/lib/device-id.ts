import { randomUUID } from 'expo-crypto';

import { isDeviceId } from '@/shared/api-headers';

import { deviceIdStorage } from './device-id-storage';

const KEY = 'device_id';

let pending: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  const stored = await deviceIdStorage.get(KEY);
  if (isDeviceId(stored)) return stored;
  const id = randomUUID();
  await deviceIdStorage.set(KEY, id);
  return id;
}

/**
 * Anonymous id of this installation (UUID v4), created on first use and kept in secure storage.
 * Sent as `X-Device-Id` for daily limits (SPEC §7.2); it is a courtesy limit, not protection (§6.2).
 * Concurrent callers share one load; a failed load is retried on the next call.
 */
export function getDeviceId(): Promise<string> {
  pending ??= loadOrCreate().catch((error: unknown) => {
    pending = null;
    throw error;
  });
  return pending;
}
