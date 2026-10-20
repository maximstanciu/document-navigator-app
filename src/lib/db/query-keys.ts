import type { DeadlineFilter } from './deadlines-repository';

/**
 * React Query keys for local data, one branch per table. Keys live here, not in features, so that a
 * write in one feature can invalidate what another feature reads (e.g. analysis → Deadlines tab).
 * Invalidate `dbKeys.<table>.all()` for every table a mutation touched.
 */
export const dbKeys = {
  all: () => ['db'] as const,
  documents: {
    all: () => ['db', 'documents'] as const,
    list: () => [...dbKeys.documents.all(), 'list'] as const,
    search: (query: string) => [...dbKeys.documents.all(), 'search', query] as const,
    titles: () => [...dbKeys.documents.all(), 'titles'] as const,
    detail: (id: string) => [...dbKeys.documents.all(), 'detail', id] as const,
  },
  pages: {
    all: () => ['db', 'pages'] as const,
    byDocument: (documentId: string) => [...dbKeys.pages.all(), 'document', documentId] as const,
  },
  deadlines: {
    all: () => ['db', 'deadlines'] as const,
    list: (filter: DeadlineFilter = {}) => [...dbKeys.deadlines.all(), 'list', filter] as const,
    detail: (id: string) => [...dbKeys.deadlines.all(), 'detail', id] as const,
  },
  actions: {
    all: () => ['db', 'actions'] as const,
    byDocument: (documentId: string) => [...dbKeys.actions.all(), 'document', documentId] as const,
    dated: () => [...dbKeys.actions.all(), 'dated'] as const,
  },
  settings: {
    all: () => ['db', 'settings'] as const,
  },
};

/**
 * Spread into `queryOptions` for local data: it only changes through our own mutations, which
 * invalidate the keys above, and a failing local read won't fix itself on retry.
 */
export const localQueryDefaults = {
  staleTime: Infinity,
  retry: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;
