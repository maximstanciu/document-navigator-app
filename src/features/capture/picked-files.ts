import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import type { CapturedMimeType, CapturedPage } from './types';

/** A file as a system picker reports it: anything but the URI can be missing. */
export type PickedFile = {
  uri: string;
  name: string | null;
  mimeType: string | null;
  size: number | null;
};

/**
 * The types «File» offers in the system picker (CAP-3). HEIF is the container of HEIC photos, and
 * some Android apps report it under that name.
 */
export const FILE_PICKER_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
];

const BY_MIME_TYPE: Record<string, CapturedMimeType> = {
  'application/pdf': 'application/pdf',
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/heic': 'image/heic',
  'image/heif': 'image/heic',
};

const BY_EXTENSION: Record<string, CapturedMimeType> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  heic: 'image/heic',
  heif: 'image/heic',
};

/** Types that say nothing about the content; the file extension decides instead. */
const GENERIC_MIME_TYPES = new Set(['', 'application/octet-stream']);

/**
 * The file's format from the reported MIME type, or from its extension when the type is missing or
 * generic. `null` for anything the app doesn't take.
 */
export function capturedMimeType(file: PickedFile): CapturedMimeType | null {
  const reported = file.mimeType?.trim().toLowerCase() ?? '';
  if (!GENERIC_MIME_TYPES.has(reported)) return BY_MIME_TYPE[reported] ?? null;
  const extension = /\.([a-z0-9]+)$/i.exec(file.name ?? file.uri)?.[1].toLowerCase();
  return (extension && BY_EXTENSION[extension]) || null;
}

export type PickedFilesCheck =
  | { status: 'ok'; pages: CapturedPage[] }
  /** A format the app doesn't take, such as a WebP photo or a Word file. */
  | { status: 'unsupported_type' }
  | { status: 'too_many_pages'; pageCount: number };

/**
 * Checks picked files before they become a document (CAP-3, CAP-7). Photos from the gallery are its
 * pages; a file is either a PDF, which is the whole document, or one image. The pickers' type filters
 * are only hints (Android file managers and browsers may ignore them), so every format is checked.
 *
 * The size limit is checked later by preparePages(), once images are normalized (CAP-4). A PDF's
 * page count is unknown on the client: the server checks it (D-4).
 */
export function checkPickedFiles(
  source: 'gallery' | 'file',
  files: readonly PickedFile[]
): PickedFilesCheck {
  const pdfAllowed = source === 'file' && files.length === 1;
  const pages: CapturedPage[] = [];
  for (const file of files) {
    const mimeType = capturedMimeType(file);
    if (!mimeType || (mimeType === 'application/pdf' && !pdfAllowed)) {
      return { status: 'unsupported_type' };
    }
    pages.push({
      uri: file.uri,
      mimeType,
      size: file.size,
      name: file.name,
      width: null,
      height: null,
    });
  }
  // The pickers stop at the limit on Android and iOS, but not on web.
  if (pages.length > MAX_DOCUMENT_PAGES) {
    return { status: 'too_many_pages', pageCount: pages.length };
  }
  return { status: 'ok', pages };
}
