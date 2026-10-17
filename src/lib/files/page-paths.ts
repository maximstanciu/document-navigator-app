/**
 * Relative page paths stored in the database (STO-3): `documents/<documentId>/<fileName>`.
 * Only safe segments are accepted, so a stored path can never point outside the documents folder.
 */

export const PAGES_ROOT = 'documents';

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function checkSegment(value: string, what: string): string {
  if (!SAFE_SEGMENT.test(value)) throw new Error(`Invalid ${what}: "${value}"`);
  return value;
}

export function pageRelativePath(documentId: string, fileName: string): string {
  return `${PAGES_ROOT}/${checkSegment(documentId, 'document id')}/${checkSegment(fileName, 'file name')}`;
}

/** Splits a stored relative path, refusing anything that isn't `documents/<id>/<file>`. */
export function splitPageRelativePath(relativePath: string): [string, string, string] {
  const parts = relativePath.split('/');
  if (parts.length !== 3 || parts[0] !== PAGES_ROOT) {
    throw new Error(`Not a page file path: "${relativePath}"`);
  }
  return [PAGES_ROOT, checkSegment(parts[1], 'document id'), checkSegment(parts[2], 'file name')];
}
