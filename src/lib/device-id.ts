import { randomUUID } from 'expo-crypto';

import { deviceIdStorage } from './device-id-storage';

const KEY = 'device_id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let pending: Promise<string> | null = null;

async function loadOrCreate(): Promise<string> {
  const stored = await deviceIdStorage.get(KEY);
  if (stored && UUID_V4.test(stored)) return stored;
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
