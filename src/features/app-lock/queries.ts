import { queryOptions } from '@tanstack/react-query';

import { getLockSupport } from './local-auth';

export const appLockKeys = {
  support: () => ['app-lock', 'support'] as const,
};

/**
 * Whether the phone can lock the app and with what (SET-8). Not local data: read again whenever
 * the app returns to the foreground, since the person may have set up or removed a screen lock or
 * biometrics in the phone's settings meanwhile.
 */
export function lockSupportQuery() {
  return queryOptions({
    queryKey: appLockKeys.support(),
    queryFn: getLockSupport,
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: 'always',
    refetchOnReconnect: false,
  });
}
