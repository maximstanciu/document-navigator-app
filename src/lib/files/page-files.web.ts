import { checkSegment, PAGES_ROOT, pageRelativePath, splitPageRelativePath } from './page-paths';

/**
 * Web is a development preview only (SPEC §9) and has no file system: page files live in memory
 * for the session, keyed by the same relative paths the native implementation returns.
 */

const files = new Map<string, string>();

export async function savePageFile(
  documentId: string,
  sourceUri: string,
  fileName: string
): Promise<string> {
  const relativePath = pageRelativePath(documentId, fileName);
  files.set(relativePath, sourceUri);
  return relativePath;
}

/** Browser pickers always report sizes (from the `File` object), so this fallback has nothing to read. */
export function capturedFileSize(_uri: string): number | null {
  return null;
}

export function pageFileUri(relativePath: string): string {
  splitPageRelativePath(relativePath);
  return files.get(relativePath) ?? '';
}

export async function pageFileExists(relativePath: string): Promise<boolean> {
  splitPageRelativePath(relativePath);
  return files.has(relativePath);
}

export async function deletePageFiles(relativePaths: readonly string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    splitPageRelativePath(relativePath);
    files.delete(relativePath);
  }
}

export async function deleteDocumentFiles(documentId: string): Promise<void> {
  const prefix = `${PAGES_ROOT}/${checkSegment(documentId, 'document id')}/`;
  for (const relativePath of [...files.keys()]) {
    if (relativePath.startsWith(prefix)) files.delete(relativePath);
  }
}

export async function deleteAllDocumentFiles(): Promise<void> {
  files.clear();
}
