import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  dismissNotification,
  getLastOpenedNotification,
  type OpenedNotification,
} from '@/features/reminders/notifications';

import type { NotificationOutcome } from '../api';
import { showNotificationOutcome } from '../notification-outcome';
import { useCompleteFromNotification, useSnoozeFromNotification } from '../queries';

/**
 * «Done» and «Remind tomorrow» on a reminder's notification (REM-15). Both bring the app up: the
 * change is made here, the notification leaves the notification center, and the Deadlines tab opens
 * with «Undo» or the time of the extra reminder. A deadline closed or gone meanwhile stays as it is,
 * and the app just opens. Handles the press that launched the app, which the OS keeps, and every press
 * while it runs, each once; the tap on the notification itself is `NotificationOpener`'s (REM-6).
 * Mount once, next to it: after the root navigator, inside the database gate.
 */
export function DeadlineNotificationActions() {
  // The hook's router, as in `NotificationOpener`: the global one is bound too late for a cold start.
  const router = useRouter();
  const { mutate: complete } = useCompleteFromNotification();
  const { mutate: snooze } = useSnoozeFromNotification();
  const lastHandledId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const show = (outcome: NotificationOutcome | null) => {
      if (!outcome) return;
      showNotificationOutcome(outcome);
      router.navigate('/deadlines');
    };

    const handle = (opened: OpenedNotification) => {
      if (opened.type !== 'reminder' || opened.action === 'open') return;
      clearLastOpenedNotification();
      // The press that launched the app comes both as the last one and to the listener.
      if (opened.notificationId === lastHandledId.current) return;
      lastHandledId.current = opened.notificationId;
      void dismissNotification(opened.notificationId).catch(() => undefined);
      if (opened.action === 'done') {
        complete(opened.deadlineId, { onSuccess: show });
      } else {
        snooze({ id: opened.deadlineId, now: new Date() }, { onSuccess: show });
      }
    };

    const removeListener = addNotificationOpenedListener(handle);
    const launchedBy = getLastOpenedNotification();
    if (launchedBy) handle(launchedBy);
    return removeListener;
  }, [router, complete, snooze]);

  return null;
}
