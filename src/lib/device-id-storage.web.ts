/** Web is a development preview only and has no secure storage: `localStorage`, when available. */
export const deviceIdStorage = {
  async get(key: string): Promise<string | null> {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // Private mode or blocked storage: the id then lives for this session only.
    }
  },
};
