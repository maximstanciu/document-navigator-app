import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { syncRemindersInBackground } from '@/features/reminders/sync-reminders';
import { dbKeys } from '@/lib/db/query-keys';
import { getRepositories } from '@/lib/db/repositories';
import { settingsQuery } from '@/lib/db/settings-query';
import type { Settings } from '@/lib/db/types';

import { deleteAllData } from './api';

/**
 * Saves a settings change and refreshes everything that reads settings (e.g. the interface
 * language). Reminders follow their defaults, time and text (SET-2, SET-5).
 */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => getRepositories().settings.update(patch),
    onSuccess: (settings) => {
      syncRemindersInBackground();
      queryClient.setQueryData(dbKeys.settings.all(), settings);
      return queryClient.invalidateQueries({ queryKey: dbKeys.settings.all() });
    },
  });
}

/**
 * Settings with the change being saved already applied, so a choice shows as soon as it is tapped
 * and goes back to what is stored if saving fails; `update` saves a change. `settings` is
 * `undefined` until the settings are read (the screen shows loading meanwhile).
 */
export function useSettings() {
  const { data } = useQuery(settingsQuery());
  const update = useUpdateSettings();
  const settings = data && { ...data, ...(update.isPending ? update.variables : undefined) };
  return { settings, update };
}

/**
 * «Delete all data» (STO-7, SET-3). Every local query reads again afterwards, also after a failure:
 * part of the data may be gone already.
 */
export function useDeleteAllData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteAllData,
    onSettled: () => queryClient.invalidateQueries({ queryKey: dbKeys.all() }),
  });
}
