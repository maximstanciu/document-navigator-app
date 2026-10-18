/** Formats a page can arrive in (CAP-3). Images become JPEG when normalized (CAP-4, task 2.4). */
export type CapturedMimeType = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/heic';

/**
 * A page that is captured but not saved yet: a file in the scanner's or picker's cache. A PDF is a
 * single page that holds the whole file (D-4).
 */
export type CapturedPage = {
  uri: string;
  mimeType: CapturedMimeType;
  /** Bytes, or `null` when the source doesn't say (the scanner). */
  size: number | null;
  /** The original file name, shown for a PDF in place of a thumbnail (CAP-5). */
  name: string | null;
};
