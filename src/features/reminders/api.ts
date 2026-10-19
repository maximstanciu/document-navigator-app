import { getRepositories } from '@/lib/db/repositories';
import type { DeadlineRecord } from '@/lib/db/types';

import {
  getNotificationPermission,
  requestNotificationPermission,
  type NotificationPermission,
} from './notifications';

/**
 * «Remind» on a deadline (DET-4, REM-3, REM-5): the deadline gets the default reminders back if
 * they were off, and the first time the system asks for the permission. Returns the permission;
 * when it isn't granted the card explains how to turn notifications on.
 */
export async function turnOnReminders(
  deadline: Pick<DeadlineRecord, 'id' | 'reminderOffsetsDays'>
): Promise<NotificationPermission> {
  if (deadline.reminderOffsetsDays?.length === 0) {
    await getRepositories().deadlines.update(deadline.id, { reminderOffsetsDays: null });
  }
  const permission = await getNotificationPermission();
  return permission === 'granted' ? permission : requestNotificationPermission();
}

/** «Don't remind» on a deadline (REM-3): `[]` turns its reminders off. */
export async function turnOffReminders(deadlineId: string): Promise<void> {
  await getRepositories().deadlines.update(deadlineId, { reminderOffsetsDays: [] });
}
