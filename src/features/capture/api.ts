import { randomUUID } from 'expo-crypto';

import { getRepositories } from '@/lib/db/repositories';
import type { DocumentSource } from '@/lib/db/types';
import { deleteDocumentFiles, savePageFile } from '@/lib/files/page-files';

import type { CapturedPage } from './types';

/**
 * Data access for the capture feature, no React: saving the reviewed pages as a draft document.
 * The mutation hook in `./queries.ts` wraps it.
 */

/**
 * Saves prepared pages as a new `draft` document (CAP-5, SPEC §6.3) and returns its id. The files are
 * copied out of the cache into the document's folder first (STO-2); if that or the database write
 * fails, the copied files are deleted, so nothing half-saved remains.
 */
export async function saveDraft(source: DocumentSource, pages: readonly CapturedPage[]) {
  if (pages.length === 0) throw new Error('A draft needs at least one page');
  const documentId = randomUUID();
  const isPdf = pages[0].mimeType === 'application/pdf';
  try {
    const savedPages = [];
    for (const page of pages) {
      const id = randomUUID();
      const relativePath = await savePageFile(
        documentId,
        page.uri,
        `${id}.${isPdf ? 'pdf' : 'jpg'}`
      );
      savedPages.push({ id, relativePath, width: page.width, height: page.height });
    }
    await getRepositories().documents.create(
      {
        id: documentId,
        // The analysis names the document; until then the list shows «Untitled».
        title: '',
        source,
        mimeType: isPdf ? 'application/pdf' : 'image/jpeg',
        // The client can't count PDF pages: the server reports them after the analysis (D-4).
        pageCount: isPdf ? null : pages.length,
        fileSize: pages.reduce((total, page) => total + (page.size ?? 0), 0),
      },
      savedPages
    );
    return documentId;
  } catch (error) {
    await deleteDocumentFiles(documentId);
    throw error;
  }
}
