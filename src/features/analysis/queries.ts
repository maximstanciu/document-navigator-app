import {
  queryOptions,
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';

import { syncRemindersInBackground } from '@/features/reminders/sync-reminders';
import { dbKeys } from '@/lib/db/query-keys';

import {
  analyzeDocument,
  cancelAnalysis,
  checkAnalysisJobs,
  fetchLimits,
  POLL_INTERVAL_MS,
  type AnalysisJobsCheck,
  type JobProgress,
} from './api';
import { AnalysisError } from './errors';

export const analysisKeys = {
  analyze: () => ['analysis', 'analyze'] as const,
  jobs: () => ['analysis', 'jobs'] as const,
  limits: () => ['analysis', 'limits'] as const,
};

/**
 * What is left of today's analyses, from the server (SET-4). Not local data: it changes with every
 * analysis (refreshed after each one) and at midnight UTC (refetched when the app comes back).
 */
export function limitsQuery() {
  return queryOptions({
    queryKey: analysisKeys.limits(),
    queryFn: fetchLimits,
  });
}

/**
 * After an analysis is stored or fails: every table it may have written is read again, its
 * deadlines get their reminders (a re-analysis may have replaced some, ANL-8), and the limit may
 * have lost one of today's.
 */
function refreshAfterAnalysis(queryClient: QueryClient) {
  syncRemindersInBackground();
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
    queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() }),
    queryClient.invalidateQueries({ queryKey: dbKeys.actions.all() }),
    queryClient.invalidateQueries({ queryKey: analysisKeys.limits() }),
  ]);
}

/**
 * The jobs of the documents being analyzed (SPEC §7.2 «Опрос»): each run asks the server about
 * them, stores what has ended and sends the queued deletions (`checkAnalysisJobs()`). It runs when
 * first observed (at startup), on return to the foreground and after every upload, then every 10 s
 * while a job is still waiting, only in the foreground. A job the server couldn't be asked about
 * keeps the progress it had.
 */
export function analysisJobsQuery() {
  return queryOptions({
    queryKey: analysisKeys.jobs(),
    queryFn: async ({ client, queryKey }): Promise<AnalysisJobsCheck> => {
      const previous = client.getQueryData<AnalysisJobsCheck>(queryKey);
      const check = await checkAnalysisJobs();
      if (check.changed) await refreshAfterAnalysis(client);
      const progress = Object.fromEntries(
        Object.entries(check.progress).map(([id, now]) => [
          id,
          now ?? previous?.progress[id] ?? null,
        ])
      );
      return { ...check, progress };
    },
    refetchInterval: (query) =>
      Object.keys(query.state.data?.progress ?? {}).length > 0 ? POLL_INTERVAL_MS : false,
    staleTime: 0,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: 'always',
    retry: false,
    // Local work too: without a network the checks keep the jobs waiting rather than pausing.
    networkMode: 'always',
  });
}

/** Keeps the jobs checked while the app runs. Mount once, inside the database gate. */
export function useAnalysisJobsPolling() {
  useQuery(analysisJobsQuery());
}

/** Where the job of this document stands, while it waits on the server (ANL-3). */
export function useJobProgress(documentId: string): JobProgress | null {
  const { data } = useQuery({
    ...analysisJobsQuery(),
    select: (check) => check.progress[documentId] ?? null,
  });
  return data ?? null;
}

/**
 * Starts the analysis of a document (ANL-1): resolves once the upload is done, and runs to the end
 * even if the screen that started it goes away (ANL-3). No retries, and it runs offline too, so
 * that a missing network fails as `offline` (ANL-10) instead of the mutation waiting for one. Then
 * the jobs are checked at once, which starts their polling.
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
    onSettled: () => {
      // Not awaited: the upload is over, while the check may wait for the server.
      void queryClient.invalidateQueries({ queryKey: analysisKeys.jobs() });
      return refreshAfterAnalysis(queryClient);
    },
  });
}

/** Whether the pages of this document are being uploaded in this run of the app (ANL-3). */
export function useIsUploading(documentId: string): boolean {
  const pending = useMutationState({
    filters: {
      mutationKey: analysisKeys.analyze(),
      status: 'pending',
      predicate: (mutation) => mutation.state.variables === documentId,
    },
  });
  return pending.length > 0;
}

/** «Cancel the analysis» (ANL-13). A cancelled analysis isn't counted, so the limit comes back. */
export function useCancelAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelAnalysis,
    networkMode: 'always',
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: dbKeys.documents.all() }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.jobs() }),
        queryClient.invalidateQueries({ queryKey: analysisKeys.limits() }),
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
