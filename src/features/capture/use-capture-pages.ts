import { useEffect, useRef, useState } from 'react';

import type { DocumentSource } from '@/lib/db/types';
import { MAX_IMAGE_PAGES } from '@/shared/limits';

import { takeSharedFiles } from './incoming-share';
import { checkPickedFiles, checkSharedFiles } from './picked-files';
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
  | 'pickerFailed'
  | 'tooManySharedPhotos'
  | 'unsupportedShare'
  | 'shareFailed';

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

type SharedPages = { source: DocumentSource; pages: CapturedPage[] };

/** Pages from the files another app shared (CAP-11), or why there are none; `null` for no share. */
async function bringInShared(): Promise<SharedPages | CaptureNotice | null> {
  const shared = await takeSharedFiles();
  if (shared.status === 'none') return null;
  if (shared.status === 'failed') return 'shareFailed';
  const check = checkSharedFiles(shared.files);
  if (check.status === 'ok') return { source: check.source, pages: check.pages };
  return check.status === 'too_many_pages' ? 'tooManySharedPhotos' : 'unsupportedShare';
}

/**
 * Brings pages in from the scanner, the gallery, a file or a share from another app and prepares them
 * for upload (CAP-2…CAP-4, CAP-7, CAP-11): for the source choice and for «Scan more» on the review. While pages are prepared,
 * `progress` is set; a problem is left in `notice`. Leaving the screen stops the preparation, so it
 * can't navigate afterwards.
 */
export function useCapturePages() {
  const [notice, setNotice] = useState<CaptureNotice | null>(null);
  const [progress, setProgress] = useState<CaptureProgress | null>(null);
  const preparation = useRef<AbortController | null>(null);
  useEffect(() => () => preparation.current?.abort(), []);

  /** Prepares pages brought in to follow `existing` ones; `null` when they don't fit (`notice`). */
  async function prepare(
    captured: CapturedPage[],
    existing: readonly CapturedPage[]
  ): Promise<CapturedPage[] | null> {
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

  /**
   * New pages to follow `existing` ones within the page and size limits, or `null` when there is
   * nothing to add: a cancel, or a problem now in `notice`.
   */
  async function capture(
    source: DocumentSource,
    existing: readonly CapturedPage[] = []
  ): Promise<CapturedPage[] | null> {
    setNotice(null);
    const captured = await bringIn(source, MAX_IMAGE_PAGES - existing.length);
    if (captured === null || typeof captured === 'string') {
      setNotice(captured);
      return null;
    }
    return prepare(captured, existing);
  }

  /**
   * The pages of a new document from the files another app shared (CAP-11), with the source they
   * count as, or `null` when nothing was shared or the files don't fit (`notice`).
   */
  async function captureShared(): Promise<SharedPages | null> {
    setNotice(null);
    // Moving the files in takes a moment for a large PDF: show it, and keep the sources disabled.
    setProgress({ done: 0, total: 0 });
    const shared = await bringInShared();
    if (shared === null || typeof shared === 'string') {
      setProgress(null);
      setNotice(shared);
      return null;
    }
    const pages = await prepare(shared.pages, []);
    return pages && { source: shared.source, pages };
  }

  return { notice, progress, capture, captureShared };
}
