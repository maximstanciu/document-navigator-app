import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { syncRemindersInBackground } from '@/features/reminders/sync-reminders';
import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';

import {
  changeDeadlineDate,
  dismissDeadline,
  listDatedActions,
  listDocumentTitles,
  listOpenDeadlines,
  restoreDeadline,
  setActionDone,
  setDeadlineDone,
} from './api';

/**
 * Local queries, one per table so that the mutations of any feature refresh them through the keys
 * they already invalidate: «Done», «Not relevant», a new date, an analysis or a deleted document.
 */
export const deadlineQueries = {
  /** The Deadlines tab and the home screen (REM-1, HOME-1, HOME-2). */
  open: () =>
    queryOptions({
      queryKey: dbKeys.deadlines.list({ statuses: ['open'] }),
      queryFn: listOpenDeadlines,
      ...localQueryDefaults,
    }),
  datedActions: () =>
    queryOptions({
      queryKey: dbKeys.actions.dated(),
      queryFn: listDatedActions,
      ...localQueryDefaults,
    }),
  /** Under the documents key: a renamed document shows its new title on the tab. */
  documentTitles: () =>
    queryOptions({
      queryKey: dbKeys.documents.titles(),
      queryFn: listDocumentTitles,
      ...localQueryDefaults,
    }),
};

/**
 * A change to deadlines or actions refreshes both tables: a deadline's status follows its actions
 * (REM-9). Reminders follow too: a closed or dismissed deadline loses them, a new date moves them.
 */
function useDeadlinesMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      syncRemindersInBackground();
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() }),
        queryClient.invalidateQueries({ queryKey: dbKeys.actions.all() }),
      ]);
    },
  });
}

export function useSetActionDone() {
  return useDeadlinesMutation(({ id, done }: { id: string; done: boolean }) =>
    setActionDone(id, done)
  );
}

export function useSetDeadlineDone() {
  return useDeadlinesMutation(({ id, done }: { id: string; done: boolean }) =>
    setDeadlineDone(id, done)
  );
}

export function useDismissDeadline() {
  return useDeadlinesMutation(dismissDeadline);
}

export function useRestoreDeadline() {
  return useDeadlinesMutation(restoreDeadline);
}

export function useChangeDeadlineDate() {
  return useDeadlinesMutation(({ id, dueDate }: { id: string; dueDate: string }) =>
    changeDeadlineDate(id, dueDate)
  );
}
