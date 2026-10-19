import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query';

import { dbKeys } from '@/lib/db/query-keys';

import { turnOffReminders, turnOnReminders } from './api';
import { getNotificationPermission, type NotificationPermission } from './notifications';
import { syncRemindersInBackground } from './sync-reminders';

export const reminderKeys = {
  permission: () => ['reminders', 'permission'] as const,
};

export const reminderQueries = {
  /**
   * The OS permission, not local data: read again whenever the app returns to the foreground,
   * since the person may have changed it in system settings (REM-5).
   */
  permission: () =>
    queryOptions({
      queryKey: reminderKeys.permission(),
      queryFn: getNotificationPermission,
      staleTime: Infinity,
      retry: false,
      refetchOnWindowFocus: 'always',
      refetchOnReconnect: false,
    }),
};

/** «Remind» on a deadline: resolves to the permission (REM-5). */
export function useTurnOnReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: turnOnReminders,
    onSuccess: (permission: NotificationPermission) => {
      queryClient.setQueryData(reminderKeys.permission(), permission);
      syncRemindersInBackground();
      return queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() });
    },
  });
}

/** «Don't remind» on a deadline (REM-3). */
export function useTurnOffReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: turnOffReminders,
    onSuccess: () => {
      syncRemindersInBackground();
      return queryClient.invalidateQueries({ queryKey: dbKeys.deadlines.all() });
    },
  });
}
