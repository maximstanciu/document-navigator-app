import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, useSyncExternalStore, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { ErrorState } from '@/components/screen-state';
import { settingsQuery } from '@/lib/db/settings-query';

import { createAppLock } from '../app-lock';
import { confirmOwner, isConfirmingOwner } from '../confirm-owner';
import { getLockSupport } from '../local-auth';
import { LockOverlay } from './lock-overlay';
import { LockScreen } from './lock-screen';

/**
 * The app lock (SET-8) around everything that shows or opens a screen. With the lock on, a launch
 * shows only the lock and asks at once; the screens (and the handlers of links and notifications)
 * mount after the owner is confirmed. Later the lock covers the mounted screens without unmounting
 * them, so what was open — a scan being checked, a picker's result — is still there after unlocking.
 * Mount inside the database gate.
 */
export function AppLock({ children }: PropsWithChildren) {
  const { data: settings, error, refetch } = useQuery(settingsQuery());
  // Not knowing whether the lock is on, show nothing rather than the documents.
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!settings) return null;
  return <AppLockGate lockedAtLaunch={settings.appLock}>{children}</AppLockGate>;
}

function AppLockGate({ lockedAtLaunch, children }: PropsWithChildren<{ lockedAtLaunch: boolean }>) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [lock] = useState(() =>
    createAppLock({
      lockedAtLaunch,
      isEnabled: () => queryClient.getQueryData(settingsQuery().queryKey)?.appLock ?? false,
      authenticate: () =>
        confirmOwner({ message: t('appLock.prompt'), cancelLabel: t('common.cancel') }),
      isAuthenticating: isConfirmingOwner,
      isAvailable: async () => (await getLockSupport()).available,
    })
  );
  const { phase, status, opened } = useSyncExternalStore(lock.subscribe, lock.getSnapshot);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', lock.appStateChanged);
    // At launch with the lock on: ask right away.
    void lock.unlock();
    return () => subscription.remove();
  }, [lock]);

  const lockScreen = (
    <LockScreen
      status={status}
      canUnlock={phase === 'locked'}
      onUnlock={() => void lock.unlock()}
    />
  );
  if (!opened) return lockScreen;
  return (
    <>
      {children}
      <LockOverlay visible={phase !== 'unlocked'}>{lockScreen}</LockOverlay>
    </>
  );
}
