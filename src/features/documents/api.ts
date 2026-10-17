import { ApiError, apiClient } from '@/lib/api/client';
import { env } from '@/lib/env';

import { documentFixtures } from './fixtures';
import type { DocumentDetail, DocumentSummary } from './types';

/**
 * Endpoint functions: one per backend call, typed, no React. Query hooks in `./queries.ts`
 * wrap them. Until `EXPO_PUBLIC_API_URL` is set they serve fixtures so the app runs offline.
 */

export async function fetchDocuments(signal?: AbortSignal): Promise<DocumentSummary[]> {
  if (!env.apiUrl) {
    return documentFixtures.map(({ id, title, updatedAt, pageCount }) => ({
      id,
      title,
      updatedAt,
      pageCount,
    }));
  }
  return apiClient.get<DocumentSummary[]>('/documents', { signal });
}

export async function fetchDocument(id: string, signal?: AbortSignal): Promise<DocumentDetail> {
  if (!env.apiUrl) {
    const document = documentFixtures.find((item) => item.id === id);
    if (!document) throw new ApiError(`Document "${id}" not found`, 404, undefined);
    return document;
  }
  return apiClient.get<DocumentDetail>(`/documents/${encodeURIComponent(id)}`, { signal });
}
