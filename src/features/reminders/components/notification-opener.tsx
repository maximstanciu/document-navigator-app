import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { documentOfAnalysisJob } from '../api';
import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  getLastOpenedNotification,
  type OpenedNotification,
} from '../notifications';

/**
 * Opens the document of a tapped notification: a reminder's (REM-6), or the one analyzed under the
 * job of a push about a finished analysis (ANL-12), which stays on the list when that document is
 * gone. The tap that launched the app, kept by the OS, and every tap while it runs. Each tap opens
 * it once: the OS forgets it after that, so a reload or remount does not open it again, and the tap
 * reported both ways at a cold start is pushed once. Mount once, inside the database gate and after
 * the root navigator, so that the document screen opens over the tabs and «Back» leads to the list.
 */
export function NotificationOpener() {
  // The hook's router queues the push from the first commit on; the global `router` is bound only
  // after it, too late for the tap that launched the app.
  const router = useRouter();
  const lastOpenedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    const openDocument = (id: string) =>
      router.push({ pathname: '/documents/[id]', params: { id } });

    const open = (opened: OpenedNotification) => {
      clearLastOpenedNotification();
      if (opened.notificationId === lastOpenedId.current) return;
      lastOpenedId.current = opened.notificationId;
      if (opened.type === 'reminder') {
        openDocument(opened.documentId);
        return;
      }
      void documentOfAnalysisJob(opened.jobId).then(
        (documentId) => {
          if (mounted && documentId) openDocument(documentId);
        },
        () => undefined
      );
    };

    const removeListener = addNotificationOpenedListener(open);
    const launchedBy = getLastOpenedNotification();
    if (launchedBy) open(launchedBy);
    return () => {
      mounted = false;
      removeListener();
    };
  }, [router]);

  return null;
}
