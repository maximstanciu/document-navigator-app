import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { checkAnalysisJobsNow } from '@/features/analysis/queries';
import { dbKeys } from '@/lib/db/query-keys';

import { documentOfAnalysisJob } from '../api';
import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  getLastOpenedNotification,
  type OpenedNotification,
} from '../notifications';

/**
 * How long a tap on the push about a finished analysis waits for its result before the document
 * opens anyway (ANL-12): the job check takes a request or two, and without a network it fails fast.
 */
export const ANALYSIS_RESULT_WAIT_MS = 5_000;

/**
 * Opens the document of a tapped notification: a reminder's (REM-6), or the one analyzed under the
 * job of a push about a finished analysis (ANL-12), which stays on the list when that document is
 * gone. That push says the job has ended, so its result is fetched and stored first, and the
 * document opens with it instead of «Analyzing…» (for `ANALYSIS_RESULT_WAIT_MS` at most). A press on
 * a reminder's button is left to `DeadlineNotificationActions` (REM-15). Handles the tap that
 * launched the app, kept by the OS, and every tap while it runs. Each tap opens its document once:
 * the OS forgets it after that, so a reload or remount does not open it again, and the tap reported
 * both ways at a cold start is pushed once. Mount once, inside the database gate and after the root
 * navigator, so that the document screen opens over the tabs and «Back» leads to the list.
 */
export function NotificationOpener() {
  // The hook's router queues the push from the first commit on; the global `router` is bound only
  // after it, too late for the tap that launched the app.
  const router = useRouter();
  const queryClient = useQueryClient();
  const lastOpenedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const openDocument = (id: string) =>
      router.push({ pathname: '/documents/[id]', params: { id } });

    const openAnalyzedDocument = async (jobId: string) => {
      await checkAnalysisJobsNow(queryClient, ANALYSIS_RESULT_WAIT_MS);
      const documentId = await documentOfAnalysisJob(jobId);
      if (!mounted || !documentId) return;
      // The check reads again only the screens on display; a document screen still cached from an
      // earlier visit would show «Analyzing…» until its own read, so it is read now.
      await queryClient.refetchQueries({ queryKey: dbKeys.documents.detail(documentId) });
      if (mounted) openDocument(documentId);
    };

    const open = (opened: OpenedNotification) => {
      // A reminder's buttons are the Deadlines tab's (REM-15): it clears them itself.
      if (opened.type === 'reminder' && opened.action !== 'open') return;
      clearLastOpenedNotification();
      if (opened.notificationId === lastOpenedId.current) return;
      lastOpenedId.current = opened.notificationId;
      if (opened.type === 'reminder') {
        openDocument(opened.documentId);
        return;
      }
      void openAnalyzedDocument(opened.jobId).catch(() => undefined);
    };

    const removeListener = addNotificationOpenedListener(open);
    const launchedBy = getLastOpenedNotification();
    if (launchedBy) open(launchedBy);
    return () => {
      mounted = false;
      removeListener();
    };
  }, [router, queryClient]);

  return null;
}
