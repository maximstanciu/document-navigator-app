import DocumentScanner, {
  ResponseType,
  ScanDocumentResponseStatus,
} from 'react-native-document-scanner-plugin';

// Adapter over the system document scanner: VisionKit on iOS, ML Kit on Android (CAP-2). The rest
// of the app sees only `scanDocument()`; swapping in the fork with the same API is a one-line change
// here (spike 0.4). The web stub is scanner.web.ts (CAP-10).

export type ScanResult =
  /** Page image file URIs in the scanner's cache, in page order. */
  | { status: 'scanned'; pages: string[] }
  | { status: 'cancelled' }
  /** The scanner could not run (no Google Play services, module not downloaded, CAP-9). */
  | { status: 'unavailable' }
  /** More pages than allowed: the page limit is Android-only and untested on a device (CAP-7). */
  | { status: 'too_many_pages'; pageCount: number }
  /** A scan is already open; the extra call is ignored. */
  | { status: 'busy' };

/** The system scanner exists on Android and iOS; web has none (CAP-10, scanner.web.ts). */
export const SCANNER_SUPPORTED: boolean = true;

/**
 * An unavailable scanner comes back as a cancel, often at once (spike 0.4). A person can't open the
 * scanner and close it this fast, so a quicker cancel means the scanner isn't there.
 */
export const UNAVAILABLE_CANCEL_MS = 1000;

let scanning = false;

export async function scanDocument({ maxPages }: { maxPages: number }): Promise<ScanResult> {
  // The plugin has no guard: one tap once opened the scanner twice on the emulator (spike 0.4).
  if (scanning) return { status: 'busy' };
  scanning = true;
  const startedAt = Date.now();
  try {
    const response = await DocumentScanner.scanDocument({
      maxNumDocuments: maxPages,
      responseType: ResponseType.ImageFilePath,
    });
    const pages = response.scannedImages ?? [];
    if (response.status !== ScanDocumentResponseStatus.Success || pages.length === 0) {
      return Date.now() - startedAt < UNAVAILABLE_CANCEL_MS
        ? { status: 'unavailable' }
        : { status: 'cancelled' };
    }
    if (pages.length > maxPages) return { status: 'too_many_pages', pageCount: pages.length };
    return { status: 'scanned', pages };
  } catch {
    // The plugin rejects only when it can't start the scanner.
    return { status: 'unavailable' };
  } finally {
    scanning = false;
  }
}
