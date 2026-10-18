import type { ScanResult } from './scanner';

export type { ScanResult } from './scanner';

/** There is no document scanner on web (CAP-10): photos and files are the ways in. */
export async function scanDocument(_options: { maxPages: number }): Promise<ScanResult> {
  return { status: 'unavailable' };
}
