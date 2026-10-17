import { queryOptions } from '@tanstack/react-query';

import { fetchDocument, fetchDocuments } from './api';

/**
 * Query keys and fetchers live together so screens, prefetching and cache invalidation all
 * agree. Use as `useQuery(documentQueries.list())`; invalidate the whole feature with
 * `queryClient.invalidateQueries({ queryKey: documentQueries.all() })`.
 */
export const documentQueries = {
  all: () => ['documents'] as const,
  list: () =>
    queryOptions({
      queryKey: [...documentQueries.all(), 'list'],
      queryFn: ({ signal }) => fetchDocuments(signal),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: [...documentQueries.all(), 'detail', id],
      queryFn: ({ signal }) => fetchDocument(id, signal),
    }),
};
