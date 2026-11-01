/**
 * Typed access to public runtime config.
 *
 * Expo inlines `process.env.EXPO_PUBLIC_*` into the JS bundle at build time, so:
 * - read each variable with direct dot access (no destructuring, no dynamic keys);
 * - never put secrets here — every value ships to every device.
 */
export const env = {
  /** Origin of this app's API routes (/api/v1/*). Empty until a backend is configured. */
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? '',
};
