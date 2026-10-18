import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dbKeys } from '@/lib/db/query-keys';

import { dismissDeadline, restoreDeadline, setActionDone, setDeadlineDone } from './api';

/**
 * A change to deadlines or actions refreshes both tables: a deadline's status follows its actions
 * (REM-9). Reminders follow these changes once `syncReminders()` exists (task 5.2).
 */
function useDeadlinesMutation<TVariables>(mutationFn: (variables: TVariables) => Promise<void>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() }),
        queryClient.invalidateQueries({ queryKey: dbKeys.actions.all() }),
      ]),
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
