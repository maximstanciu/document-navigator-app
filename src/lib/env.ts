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
  /**
   * How long the app waits for an analysis (SPEC §7.2): 90 s, or longer for a backend whose model
   * runs on a CPU (deploy/README.md).
   */
  analyzeTimeoutMs: positiveWholeNumber(process.env.EXPO_PUBLIC_ANALYZE_TIMEOUT_MS) ?? 90_000,
};

function positiveWholeNumber(raw: string | undefined): number | null {
  const value = Number(raw);
  return raw && Number.isInteger(value) && value > 0 ? value : null;
}
