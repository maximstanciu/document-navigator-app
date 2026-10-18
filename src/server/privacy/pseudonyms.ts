// Pseudonyms for logs and counters (SPEC §7.1, §8.3): HMAC-SHA-256 with a server-side key, cut to
// 64 bits. Without the key a device id or an IP address doesn't give its pseudonym, so logs and
// counters can't be matched with a phone. They are still personal data under GDPR (pseudonymous).

export function hashDeviceId(deviceId: string, key: string): Promise<string> {
  return pseudonym(`device:${deviceId.toLowerCase()}`, key);
}

export function hashClientIp(ip: string, key: string): Promise<string> {
  return pseudonym(`ip:${ip.toLowerCase()}`, key);
}

async function pseudonym(value: string, key: string): Promise<string> {
  const encoder = new TextEncoder();
  const hmacKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', hmacKey, encoder.encode(value))
  );
  return Array.from(signature.slice(0, 8), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
