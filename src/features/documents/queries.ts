import { queryOptions } from '@tanstack/react-query';

import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';

import {
  getDocument,
  getDocumentPages,
  listDocumentActions,
  listDocumentDeadlines,
  listDocuments,
} from './api';

/**
 * Local queries: keys come from `dbKeys` so any feature that writes documents can invalidate
 * them (`queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() })`).
 */
export const documentQueries = {
  list: () =>
    queryOptions({
      queryKey: dbKeys.documents.list(),
      queryFn: listDocuments,
      ...localQueryDefaults,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: dbKeys.documents.detail(id),
      queryFn: () => getDocument(id),
      ...localQueryDefaults,
    }),
  pages: (id: string) =>
    queryOptions({
      queryKey: dbKeys.pages.byDocument(id),
      queryFn: () => getDocumentPages(id),
      ...localQueryDefaults,
    }),
  deadlines: (id: string) =>
    queryOptions({
      queryKey: dbKeys.deadlines.list({ documentId: id }),
      queryFn: () => listDocumentDeadlines(id),
      ...localQueryDefaults,
    }),
  actions: (id: string) =>
    queryOptions({
      queryKey: dbKeys.actions.byDocument(id),
      queryFn: () => listDocumentActions(id),
      ...localQueryDefaults,
    }),
};
