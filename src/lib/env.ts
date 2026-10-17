/**
 * Typed access to public runtime config.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` into the JS bundle at build time, so:
 * - read each variable with direct dot access (no destructuring, no dynamic keys);
 * - never put secrets here — every value ships to every device.
 */
export const env = {
  /** Base URL of the backend API. Empty means "no backend": features fall back to fixtures. */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
};
