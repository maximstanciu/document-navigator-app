import { useMutation, useQueryClient } from '@tanstack/react-query';

import { dbKeys } from '@/lib/db/query-keys';
import { getRepositories } from '@/lib/db/repositories';
import type { Settings } from '@/lib/db/types';

/** Saves a settings change and refreshes everything that reads settings (e.g. the interface language). */
export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => getRepositories().settings.update(patch),
    onSuccess: (settings) => {
      queryClient.setQueryData(dbKeys.settings.all(), settings);
      return queryClient.invalidateQueries({ queryKey: dbKeys.settings.all() });
    },
  });
}
