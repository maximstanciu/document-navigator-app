import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  addReminderOpenedListener,
  clearLastOpenedReminder,
  getLastOpenedReminder,
  type OpenedReminder,
} from '../notifications';

/**
 * Opens the document of a tapped reminder (REM-6): the tap that launched the app, kept by the OS,
 * and every tap while it runs. Each tap opens it once: the OS forgets it after that, so a reload or
 * remount does not open it again, and the tap reported both ways at a cold start is pushed once.
 * Mount once, inside the database gate and after the root navigator, so that the document screen
 * opens over the tabs and «Back» leads to the list.
 */
export function ReminderOpener() {
  // The hook's router queues the push from the first commit on; the global `router` is bound only
  // after it, too late for the tap that launched the app.
  const router = useRouter();
  const lastOpenedId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const open = (reminder: OpenedReminder) => {
      clearLastOpenedReminder();
      if (reminder.notificationId === lastOpenedId.current) return;
      lastOpenedId.current = reminder.notificationId;
      router.push({ pathname: '/documents/[id]', params: { id: reminder.documentId } });
    };

    const removeListener = addReminderOpenedListener(open);
    const launchedBy = getLastOpenedReminder();
    if (launchedBy) open(launchedBy);
    return removeListener;
  }, [router]);

  return null;
}
