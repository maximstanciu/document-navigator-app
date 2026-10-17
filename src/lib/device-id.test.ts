const UUID_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const UUID_B = '9b2f6c1e-2c8d-4e5f-8a7b-1c2d3e4f5a6b';

const mockStore = new Map<string, string>();
const mockRandomUUID = jest.fn<string, []>();

jest.mock('expo-crypto', () => ({ randomUUID: () => mockRandomUUID() }));
jest.mock('./device-id-storage', () => ({
  deviceIdStorage: {
    get: jest.fn(async (key: string) => mockStore.get(key) ?? null),
    set: jest.fn(async (key: string, value: string) => {
      mockStore.set(key, value);
    }),
  },
}));

/** A fresh copy of the module, as after an app restart. */
function loadModule(): typeof import('./device-id') {
  let loaded!: typeof import('./device-id');
  jest.isolateModules(() => {
    loaded = jest.requireActual('./device-id');
  });
  return loaded;
}

beforeEach(() => {
  mockStore.clear();
  mockRandomUUID.mockReset().mockReturnValueOnce(UUID_A).mockReturnValueOnce(UUID_B);
});

describe('getDeviceId (1.5)', () => {
  it('creates a UUID on first use and stores it', async () => {
    await expect(loadModule().getDeviceId()).resolves.toBe(UUID_A);

    expect(mockStore.get('device_id')).toBe(UUID_A);
  });

  it('stays the same across app restarts', async () => {
    const first = await loadModule().getDeviceId();
    const afterRestart = await loadModule().getDeviceId();

    expect(afterRestart).toBe(first);
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it('creates the id once for concurrent callers', async () => {
    const { getDeviceId } = loadModule();

    const ids = await Promise.all([getDeviceId(), getDeviceId(), getDeviceId()]);

    expect(ids).toEqual([UUID_A, UUID_A, UUID_A]);
    expect(mockRandomUUID).toHaveBeenCalledTimes(1);
  });

  it('replaces a stored value that is not a UUID', async () => {
    mockStore.set('device_id', 'garbage');

    await expect(loadModule().getDeviceId()).resolves.toBe(UUID_A);
    expect(mockStore.get('device_id')).toBe(UUID_A);
  });

  it('retries after a storage failure instead of caching it', async () => {
    const { deviceIdStorage } = jest.requireMock('./device-id-storage') as {
      deviceIdStorage: { get: jest.Mock };
    };
    deviceIdStorage.get.mockRejectedValueOnce(new Error('Keystore unavailable'));
    const { getDeviceId } = loadModule();

    await expect(getDeviceId()).rejects.toThrow('Keystore unavailable');
    await expect(getDeviceId()).resolves.toBe(UUID_A);
  });
});
