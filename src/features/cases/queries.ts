import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';
import { invalidateKeys } from '@/lib/query-client';

import {
  createCase,
  deleteCase,
  getCase,
  listCases,
  moveToCase,
  renameCase,
  setCaseArchived,
} from './api';

/**
 * Local queries. How many documents a case has comes from the documents list the screens already
 * read, so filing a document only has to refresh the documents.
 */
export const caseQueries = {
  list: () =>
    queryOptions({
      queryKey: dbKeys.cases.list(),
      queryFn: listCases,
      ...localQueryDefaults,
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: dbKeys.cases.detail(id),
      queryFn: () => getCase(id),
      ...localQueryDefaults,
    }),
};

/**
 * Cases and the documents filed in them change together. A case deleted meanwhile fails the change
 * and still refreshes them, so the screens stop offering it.
 */
function useCasesMutation<TVariables, TResult>(
  mutationFn: (variables: TVariables) => Promise<TResult>
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => invalidateKeys(queryClient, dbKeys.cases.all(), dbKeys.documents.all()),
  });
}

/** «New case», with the documents to file in it at once (CASE-1, CASE-2). Resolves to its id. */
export function useCreateCase() {
  return useCasesMutation(
    ({ name, documentIds }: { name: string; documentIds?: readonly string[] }) =>
      createCase(name, documentIds)
  );
}

/** «Rename» on the case screen (CASE-5). */
export function useRenameCase() {
  return useCasesMutation(({ id, name }: { id: string; name: string }) => renameCase(id, name));
}

/**
 * «Archive» / «Restore from archive» (CASE-6). The documents' summaries carry whether their case is
 * archived, so they refresh too.
 */
export function useSetCaseArchived() {
  return useCasesMutation(({ id, archived }: { id: string; archived: boolean }) =>
    setCaseArchived(id, archived)
  );
}

/** «Delete case» (CASE-5): its documents stay. */
export function useDeleteCase() {
  return useCasesMutation(deleteCase);
}

/** Files documents in a case or takes them out of it (CASE-2, CASE-4). */
export function useMoveToCase() {
  return useCasesMutation(
    ({ documentIds, caseId }: { documentIds: readonly string[]; caseId: string | null }) =>
      moveToCase(documentIds, caseId)
  );
}
