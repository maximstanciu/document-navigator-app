import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';

import { dbKeys } from '@/lib/db/query-keys';

import { analyzeDocument } from './api';
import { AnalysisError } from './errors';

export const analysisKeys = {
  analyze: () => ['analysis', 'analyze'] as const,
};

/**
 * Starts the analysis of a document (ANL-1). Runs to the end even if the screen that started it
 * goes away (ANL-3): the result lands in the database, and every table it wrote is refreshed.
 * No retries, and it runs offline too, so that a missing network fails as `offline` (ANL-10)
 * instead of the mutation waiting for one.
 */
export function useAnalyzeDocument() {
  const queryClient = useQueryClient();
  const refreshDocuments = () =>
    queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() });
  return useMutation({
    mutationKey: analysisKeys.analyze(),
    mutationFn: (documentId: string) => analyzeDocument(documentId, refreshDocuments),
    retry: false,
    networkMode: 'always',
    onSettled: () =>
      Promise.all([
        refreshDocuments(),
        queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() }),
        queryClient.invalidateQueries({ queryKey: dbKeys.actions.all() }),
      ]),
  });
}

/**
 * The error of the latest analysis of this document in this run of the app, wherever it was
 * started. The database keeps only the code; this adds what a `429` said about when to try again.
 */
export function useLastAnalysisError(documentId: string): AnalysisError | null {
  const errors = useMutationState({
    filters: {
      mutationKey: analysisKeys.analyze(),
      predicate: (mutation) => mutation.state.variables === documentId,
    },
    select: (mutation) => mutation.state.error,
  });
  const last = errors.at(-1);
  return last instanceof AnalysisError ? last : null;
}
