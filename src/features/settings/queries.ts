import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { confirmOwner } from '@/features/app-lock/confirm-owner';
import type { AuthPrompt, AuthResult } from '@/features/app-lock/local-auth';
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
 * Turns the app lock on or off (SET-8) once the owner confirms it in the system prompt, so that
 * neither a lock that can't be opened gets turned on nor someone holding the open app turns it off.
 * `prompt: null` skips the check: turning it off on a phone without a screen lock, where there is
 * nothing to check against. Resolves to the prompt's result; only `success` changes the setting.
 */
export function useSetAppLock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      enabled,
      prompt,
    }: {
      enabled: boolean;
      prompt: AuthPrompt | null;
    }): Promise<AuthResult> => {
      const result = prompt ? await confirmOwner(prompt) : 'success';
      if (result === 'success') await getRepositories().settings.update({ appLock: enabled });
      return result;
    },
    onSuccess: (result) =>
      result === 'success'
        ? queryClient.invalidateQueries({ queryKey: dbKeys.settings.all() })
        : undefined,
  });
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
