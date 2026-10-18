import { useEffect, useRef, useState } from 'react';

import type { DocumentSource } from '@/lib/db/types';
import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { checkPickedFiles } from './picked-files';
import { pickFile, pickPhotos } from './pickers';
import { checkDocumentSize, preparePages } from './prepare-pages';
import { scanDocument } from './scanner';
import type { CapturedPage } from './types';

/** Why nothing was added; components/capture-status.tsx turns it into text. */
export type CaptureNotice =
  | 'scannerUnavailable'
  | 'tooManyPages'
  | 'tooManyPhotos'
  | 'unsupportedPhoto'
  | 'unsupportedFile'
  | 'fileTooLarge'
  | 'pagesTooLarge'
  | 'unreadableImage'
  | 'pickerFailed';

export type CaptureProgress = { done: number; total: number };

/** Pages from a source as they come, or why there are none; `null` for a cancel. */
async function bringIn(
  source: DocumentSource,
  maxPages: number
): Promise<CapturedPage[] | CaptureNotice | null> {
  if (source === 'scan') {
    const result = await scanDocument({ maxPages });
    if (result.status === 'scanned') {
      // Both system scanners save pages as JPEG.
      return result.pages.map((uri) => ({
        uri,
        mimeType: 'image/jpeg',
        size: null,
        name: null,
        width: null,
        height: null,
      }));
    }
    // The other sources still work without the scanner (CAP-9).
    if (result.status === 'unavailable') return 'scannerUnavailable';
    if (result.status === 'too_many_pages') return 'tooManyPages';
    return null;
  }
  const result = source === 'gallery' ? await pickPhotos({ maxPages }) : await pickFile();
  if (result.status === 'failed') return 'pickerFailed';
  if (result.status !== 'picked') return null;
  const check = checkPickedFiles(source, result.files, maxPages);
  if (check.status === 'ok') return check.pages;
  if (check.status === 'too_many_pages') return 'tooManyPhotos';
  return source === 'gallery' ? 'unsupportedPhoto' : 'unsupportedFile';
}

/**
 * Brings pages in from the scanner, the gallery or a file and prepares them for upload (CAP-2…CAP-4,
 * CAP-7): for the source choice and for «Scan more» on the review. While pages are prepared,
 * `progress` is set; a problem is left in `notice`. Leaving the screen stops the preparation, so it
 * can't navigate afterwards.
 */
export function useCapturePages() {
  const [notice, setNotice] = useState<CaptureNotice | null>(null);
  const [progress, setProgress] = useState<CaptureProgress | null>(null);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);

  /**
   * New pages to follow `existing` ones within the page and size limits, or `null` when there is
   * nothing to add: a cancel, or a problem now in `notice`.
   */
  async function capture(
    source: DocumentSource,
    existing: readonly CapturedPage[] = []
  ): Promise<CapturedPage[] | null> {
    setNotice(null);
    const captured = await bringIn(source, MAX_DOCUMENT_PAGES - existing.length);
    if (captured === null || typeof captured === 'string') {
      setNotice(captured);
      return null;
    }

    const controller = new AbortController();
    preparation.current = controller;
    setProgress({ done: 0, total: captured.length });
    const prepared = await preparePages(captured, {
      signal: controller.signal,
      onProgress: (done) => setProgress({ done, total: captured.length }),
    });
    if (controller.signal.aborted) return null;
    setProgress(null);
    if (prepared.status !== 'ok') {
      setNotice(prepared.status === 'unreadable' ? 'unreadableImage' : null);
      return null;
    }
    if (checkDocumentSize([...existing, ...prepared.pages]).status === 'too_large') {
      const isPdf = prepared.pages[0]?.mimeType === 'application/pdf';
      setNotice(isPdf ? 'fileTooLarge' : 'pagesTooLarge');
      return null;
    }
    return prepared.pages;
  }

  return { notice, progress, capture };
}
