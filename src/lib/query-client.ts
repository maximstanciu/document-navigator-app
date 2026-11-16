import { focusManager, QueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { isRefusedRequest } from '@/lib/api/client';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // A refused request won't fix itself; only network failures, 429 and 5xx are retried.
        retry: (failureCount, error) => !isRefusedRequest(error) && failureCount < 2,
      },
    },
  });
}

/**
 * Marks the queries under each of `keys` stale, refetching the active ones, all at once: what a
 * mutation does for every table (`dbKeys.<table>.all()`) or remote resource it changed.
 */
export async function invalidateKeys(queryClient: QueryClient, ...keys: QueryKey[]) {
  await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
}

/**
 * React Native has no window focus events. Tell React Query when the app returns to the
 * foreground so stale queries refetch, like they would on a browser tab focus.
 */
export function useAppStateFocusManager() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const subscription = AppState.addEventListener('change', (status) => {
      focusManager.setFocused(status === 'active');
    });
    return () => subscription.remove();
  }, []);
}
