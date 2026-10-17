import { Directory, File, Paths } from 'expo-file-system';

import { checkSegment, PAGES_ROOT, pageRelativePath, splitPageRelativePath } from './page-paths';

/**
 * Page files of documents (STO-2): `Paths.document/documents/<documentId>/<fileName>`.
 * The database stores only the relative path (STO-3), because the absolute app container path
 * changes between iOS updates. The cache directory is never used: the system may clear it.
 */

function pageFile(relativePath: string): File {
  return new File(Paths.document, ...splitPageRelativePath(relativePath));
}

/**
 * Copies a page (scanner output, picked photo or file, normalized image) into the document's
 * folder and returns the relative path to store in `pages.relative_path`.
 */
export async function savePageFile(
  documentId: string,
  sourceUri: string,
  fileName: string
): Promise<string> {
  const relativePath = pageRelativePath(documentId, fileName);
  const folder = new Directory(Paths.document, PAGES_ROOT, documentId);
  folder.create({ intermediates: true, idempotent: true });
  await new File(sourceUri).copy(new File(folder, fileName), { overwrite: true });
  return relativePath;
}

/** Absolute URI for `<Image>`, sharing and upload. */
export function pageFileUri(relativePath: string): string {
  return pageFile(relativePath).uri;
}

/** `false` when the file is gone (restored backup, failed write): screens must cope (STO-8). */
export async function pageFileExists(relativePath: string): Promise<boolean> {
  return pageFile(relativePath).exists;
}

/** Deletes the given page files; missing ones are skipped. */
export async function deletePageFiles(relativePaths: readonly string[]): Promise<void> {
  for (const relativePath of relativePaths) {
    const file = pageFile(relativePath);
    if (file.exists) file.delete();
  }
}

/** Deletes a document's folder with every page in it (STO-6). */
export async function deleteDocumentFiles(documentId: string): Promise<void> {
  const folder = new Directory(Paths.document, PAGES_ROOT, checkSegment(documentId, 'document id'));
  if (folder.exists) folder.delete();
}

/** Deletes the page files of all documents ("Delete all data", STO-7). */
export async function deleteAllDocumentFiles(): Promise<void> {
  const root = new Directory(Paths.document, PAGES_ROOT);
  if (root.exists) root.delete();
}
