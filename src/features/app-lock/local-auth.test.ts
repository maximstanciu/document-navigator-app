import {
  authenticateAsync,
  AuthenticationType,
  getEnrolledLevelAsync,
  SecurityLevel,
  supportedAuthenticationTypesAsync,
} from 'expo-local-authentication';

// Every other test sees the fake adapter (src/test/setup-native-modules.ts); this one tests the
// adapter over the mocked library.
jest.unmock('./local-auth');
jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn(),
  getEnrolledLevelAsync: jest.fn(),
  supportedAuthenticationTypesAsync: jest.fn(),
  AuthenticationType: { FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3 },
  SecurityLevel: { NONE: 0, SECRET: 1, BIOMETRIC_WEAK: 2, BIOMETRIC_STRONG: 3 },
}));

const { authenticate, biometryOf, getLockSupport } =
  jest.requireActual<typeof import('./local-auth')>('./local-auth');

const authenticateMock = jest.mocked(authenticateAsync);
const levelMock = jest.mocked(getEnrolledLevelAsync);
const typesMock = jest.mocked(supportedAuthenticationTypesAsync);

const prompt = { message: 'Unlock DocNavigator', cancelLabel: 'Cancel' };

beforeEach(() => {
  authenticateMock.mockReset();
  levelMock.mockReset();
  typesMock.mockReset().mockResolvedValue([]);
});

describe('getLockSupport', () => {
  it('reports no lock on a phone without a screen lock', async () => {
    levelMock.mockResolvedValue(SecurityLevel.NONE);

    expect(await getLockSupport()).toEqual({ supported: true, available: false, biometry: null });
  });

  it('names no biometry when only a code is set up, whatever hardware the phone has', async () => {
    levelMock.mockResolvedValue(SecurityLevel.SECRET);
    typesMock.mockResolvedValue([AuthenticationType.FACIAL_RECOGNITION]);

    expect(await getLockSupport()).toEqual({ supported: true, available: true, biometry: null });
  });

  it('names the biometry of a phone with biometrics set up (iOS in Jest)', async () => {
    levelMock.mockResolvedValue(SecurityLevel.BIOMETRIC_STRONG);
    typesMock.mockResolvedValue([AuthenticationType.FACIAL_RECOGNITION]);

    expect(await getLockSupport()).toEqual({
      supported: true,
      available: true,
      biometry: 'faceId',
    });
  });
});

describe('biometryOf', () => {
  it('uses the iPhone names on iOS', () => {
    expect(biometryOf([AuthenticationType.FACIAL_RECOGNITION], 'ios')).toBe('faceId');
    expect(biometryOf([AuthenticationType.FINGERPRINT], 'ios')).toBe('touchId');
    expect(biometryOf([], 'ios')).toBeNull();
  });

  it('names one kind on Android, and biometrics in general for several', () => {
    expect(biometryOf([AuthenticationType.FINGERPRINT], 'android')).toBe('fingerprint');
    expect(biometryOf([AuthenticationType.FACIAL_RECOGNITION], 'android')).toBe('face');
    expect(biometryOf([AuthenticationType.IRIS], 'android')).toBe('biometrics');
    expect(
      biometryOf([AuthenticationType.FINGERPRINT, AuthenticationType.FACIAL_RECOGNITION], 'android')
    ).toBe('biometrics');
    expect(biometryOf([], 'android')).toBeNull();
  });
});

describe('authenticate', () => {
  it('asks with the phone’s code as the fallback and no extra confirmation', async () => {
    authenticateMock.mockResolvedValue({ success: true });

    expect(await authenticate(prompt)).toBe('success');
    expect(authenticateMock).toHaveBeenCalledWith({
      promptMessage: 'Unlock DocNavigator',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
      requireConfirmation: false,
    });
  });

  it.each([
    ['user_cancel', 'cancel'],
    ['system_cancel', 'cancel'],
    ['app_cancel', 'cancel'],
    ['user_fallback', 'cancel'],
    ['lockout', 'lockout'],
    ['not_enrolled', 'unavailable'],
    ['passcode_not_set', 'unavailable'],
    ['not_available', 'unavailable'],
    ['authentication_failed', 'failed'],
    ['timeout', 'failed'],
    ['unknown', 'failed'],
  ] as const)('reports %s as %s', async (error, result) => {
    authenticateMock.mockResolvedValue({ success: false, error });

    expect(await authenticate(prompt)).toBe(result);
  });

  it('reports a native rejection as a failure instead of throwing', async () => {
    authenticateMock.mockRejectedValue(new Error('Missing activity'));

    expect(await authenticate(prompt)).toBe('failed');
  });
});
