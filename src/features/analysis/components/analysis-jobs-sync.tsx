import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import {
  addAnalysisPushListener,
  addPushTokenChangeListener,
} from '@/features/reminders/notifications';

import { sendPushTokenToJobsInBackground } from '../api';
import { analysisKeys, useAnalysisJobsPolling } from '../queries';

/**
 * Checks the analysis jobs at startup, on return to the foreground and every 10 s while one waits
 * (SPEC §7.2 «Опрос»), whatever screen is open: a result is stored as soon as it is ready, and
 * queued deletions are sent again. A push about a finished job that comes while the app is open is
 * not shown: the jobs are checked at once instead (ANL-12). The waiting jobs get the push token at
 * startup, on return to the foreground (notifications may have been allowed in system settings)
 * and when the push service changes it. Mount once, inside the database gate.
 */
export function AnalysisJobsSync() {
  const queryClient = useQueryClient();
  useAnalysisJobsPolling();

  useEffect(() => {
    const removePushListener = addAnalysisPushListener(() => {
      void queryClient.invalidateQueries({ queryKey: analysisKeys.jobs() });
    });
    const removeTokenListener = addPushTokenChangeListener(sendPushTokenToJobsInBackground);
    sendPushTokenToJobsInBackground();
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') sendPushTokenToJobsInBackground();
    });
    return () => {
      removePushListener();
      removeTokenListener();
      subscription.remove();
    };
  }, [queryClient]);

  return null;
}
