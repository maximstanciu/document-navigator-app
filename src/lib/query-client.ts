import { focusManager, QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { ApiError } from '@/lib/api/client';

const NO_RETRY_STATUSES = new Set([400, 401, 403, 404, 409, 422]);

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors won't fix themselves; only retry network failures and 5xx.
        retry: (failureCount, error) =>
          !(error instanceof ApiError && NO_RETRY_STATUSES.has(error.status)) && failureCount < 2,
      },
    },
  });
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
