import * as SecureStore from 'expo-secure-store';

/**
 * Where the device id lives: Keychain on iOS (may survive a reinstall, not guaranteed), Android
 * Keystore-encrypted storage (gone after uninstall or a backup restore). Web: see `.web.ts`.
 */
export const deviceIdStorage = {
  get: (key: string) => SecureStore.getItemAsync(key),
  set: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};
