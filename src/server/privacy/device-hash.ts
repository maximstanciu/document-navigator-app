/**
 * Pseudonym of a device id for logs and limit counters (SPEC §7.1, §8.3): HMAC-SHA-256 with a
 * server-side key, cut to 64 bits. Without the key, the device id alone doesn't give its hash, so
 * the logs can't be matched with a phone. It is still personal data under GDPR (pseudonymous).
 */
export async function hashDeviceId(deviceId: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(deviceId.toLowerCase()))
  );
  return Array.from(signature.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
