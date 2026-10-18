import { MAX_DOCUMENT_BYTES } from '@/shared/limits';

import { normalizeImage } from './normalize-image';
import type { CapturedPage } from './types';

export type PreparedPages =
  | { status: 'ok'; pages: CapturedPage[] }
  /** An image the system can't decode: a damaged file, or HEIC before Android 9. */
  | { status: 'unreadable' }
  | { status: 'aborted' };

type PrepareOptions = {
  /** Called after each page with the number of pages done. */
  onProgress?: (done: number) => void;
  /** Stops between pages, e.g. when the capture modal is closed. */
  signal?: AbortSignal;
};

/**
 * Turns captured pages into what is uploaded: every image becomes a normalized JPEG (CAP-4), a PDF
 * stays as it is (D-4). Pages go one at a time, so at most one decoded image is in memory.
 */
export async function preparePages(
  pages: readonly CapturedPage[],
  { onProgress, signal }: PrepareOptions = {}
): Promise<PreparedPages> {
  const prepared: CapturedPage[] = [];
  for (const page of pages) {
    if (signal?.aborted) return { status: 'aborted' };
    if (page.mimeType === 'application/pdf') {
      prepared.push(page);
    } else {
      try {
        const image = await normalizeImage(page.uri);
        prepared.push({ ...page, ...image, mimeType: 'image/jpeg' });
      } catch {
        return { status: 'unreadable' };
      }
    }
    onProgress?.(prepared.length);
  }
  if (signal?.aborted) return { status: 'aborted' };
  return { status: 'ok', pages: prepared };
}

/**
 * The upload limit for a whole document (CAP-7), checked on prepared pages: photos and scans shrink
 * several times when normalized, so only then is their size known. A page of unknown size counts as
 * zero; the server checks it with 413.
 */
export function checkDocumentSize(
  pages: readonly CapturedPage[]
): { status: 'ok' } | { status: 'too_large'; size: number } {
  const size = pages.reduce((total, page) => total + (page.size ?? 0), 0);
  return size > MAX_DOCUMENT_BYTES ? { status: 'too_large', size } : { status: 'ok' };
}
