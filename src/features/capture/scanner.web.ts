import type { ScanResult } from './scanner';

export type { ScanResult } from './scanner';

/** There is no document scanner on web (CAP-10): the capture screen offers photos and files only. */
export const SCANNER_SUPPORTED: boolean = false;

/** Never called: the scan option isn't shown on web. */
export async function scanDocument(_options: { maxPages: number }): Promise<ScanResult> {
  return { status: 'unavailable' };
}
