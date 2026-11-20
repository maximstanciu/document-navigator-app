import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { syncRemindersInBackground } from '@/features/reminders/sync-reminders';
import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';

import {
  deleteDocument,
  dismissAttention,
  dismissRelatedDocument,
  getDocument,
  getDocumentPages,
  listDocumentActions,
  listDocumentDeadlines,
  listDocuments,
  listRelatedDocuments,
  renameDocument,
  searchDocuments,
  setDocumentArchived,
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
  detail: (id: string) =>
    queryOptions({
      queryKey: dbKeys.documents.detail(id),
      queryFn: () => getDocument(id),
      ...localQueryDefaults,
    }),
  /** Under the documents' keys: a new analysis, a case or a deletion changes what is related. */
  related: (id: string) =>
    queryOptions({
      queryKey: dbKeys.documents.related(id),
      queryFn: () => listRelatedDocuments(id),
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

/** A change to documents alone: everything read under the documents' keys reads again. */
function useDocumentsMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
  });
}

/** «Got it» on a warning in «Needs attention» (HOME-1). */
export function useDismissAttention() {
  return useDocumentsMutation(dismissAttention);
}

/** «Not related» on the row of a related document (LINK-4): it goes from both documents' screens. */
export function useDismissRelatedDocument() {
  return useDocumentsMutation(({ id, relatedId }: { id: string; relatedId: string }) =>
    dismissRelatedDocument(id, relatedId)
  );
}

/** «Rename» on the document screen (DET-9). */
export function useRenameDocument() {
  return useDocumentsMutation(({ id, title }: { id: string; title: string }) =>
    renameDocument(id, title)
  );
}

/**
 * «Archive» / «Restore from archive» on the document screen (HOME-6). Its deadlines don't change,
 * so neither do the Deadlines tab or reminders.
 */
export function useSetDocumentArchived() {
  return useDocumentsMutation(({ id, archived }: { id: string; archived: boolean }) =>
    setDocumentArchived(id, archived)
  );
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
