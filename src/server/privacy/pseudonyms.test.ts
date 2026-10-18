/** @jest-environment node */
import { hashClientIp, hashDeviceId } from './pseudonyms';

const DEVICE_ID = '6f1c2a9e-3b7d-4c8e-9f0a-1b2c3d4e5f60';

describe('hashDeviceId', () => {
  it('gives 64 bits of hex that stay the same for a device', async () => {
    const hash = await hashDeviceId(DEVICE_ID, 'key-1');

    expect(hash).toMatch(/^[0-9a-f]{16}$/);
    await expect(hashDeviceId(DEVICE_ID, 'key-1')).resolves.toBe(hash);
    await expect(hashDeviceId(DEVICE_ID.toUpperCase(), 'key-1')).resolves.toBe(hash);
  });

  it('depends on the key, so the device id alone does not give the hash', async () => {
    const [one, other] = await Promise.all([
      hashDeviceId(DEVICE_ID, 'key-1'),
      hashDeviceId(DEVICE_ID, 'key-2'),
    ]);
    expect(one).not.toBe(other);
  });

  it('tells devices apart', async () => {
    const other = '0b8e7d6c-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
    await expect(hashDeviceId(other, 'key-1')).resolves.not.toBe(
      await hashDeviceId(DEVICE_ID, 'key-1')
    );
  });
});

describe('hashClientIp', () => {
  it('gives a pseudonym that differs from a device id hashed the same way', async () => {
    const ip = await hashClientIp('203.0.113.7', 'key-1');

    expect(ip).toMatch(/^[0-9a-f]{16}$/);
    await expect(hashClientIp('203.0.113.7', 'key-1')).resolves.toBe(ip);
    await expect(hashDeviceId('203.0.113.7', 'key-1')).resolves.not.toBe(ip);
  });
});
