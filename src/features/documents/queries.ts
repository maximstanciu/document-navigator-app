import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { syncRemindersInBackground } from '@/features/reminders/sync-reminders';
import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';

import {
  deleteDocument,
  dismissAttention,
  getDocument,
  getDocumentPages,
  listDocumentActions,
  listDocumentDeadlines,
  listDocuments,
  listOpenDeadlines,
  renameDocument,
  searchDocuments,
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
  search: (query: string) =>
    queryOptions({
      queryKey: dbKeys.documents.search(query),
      queryFn: () => searchDocuments(query),
      ...localQueryDefaults,
    }),
  /** Under the deadlines key: «Done» and «Not relevant» on any screen refresh the home screen. */
  openDeadlines: () =>
    queryOptions({
      queryKey: dbKeys.deadlines.list({ statuses: ['open'] }),
      queryFn: listOpenDeadlines,
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

/** «Got it» on a warning in «Needs attention» (HOME-1). */
export function useDismissAttention() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: dismissAttention,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
  });
}

/** «Rename» on the document screen (DET-9). */
export function useRenameDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => renameDocument(id, title),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
  });
}

/**
 * «Delete» on the document screen (DET-9, STO-6). Every local query is refreshed: the document's
 * pages, deadlines and actions are gone too. So are its reminders: the sync cancels them in the OS.
 */
export function useDeleteDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      syncRemindersInBackground();
      return queryClient.invalidateQueries({ queryKey: dbKeys.all() });
    },
  });
}
