import { useQuery } from '@tanstack/react-query';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, type PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';

import { ErrorState } from '@/components/screen-state';
import { openAppDatabase } from '@/lib/db/open-database';
import { applyStoredLanguage } from '@/lib/i18n/i18n';

/**
 * Renders the app only after the database is open and migrated (STO-5) and the stored interface
 * language is applied (SET-1). The splash screen stays up meanwhile (`preventAutoHideAsync` in the
 * root layout); a failure shows an error with retry.
 */
export function DatabaseGate({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { status, error, refetch } = useQuery({
    queryKey: ['app', 'database'],
    queryFn: async () => {
      await openAppDatabase();
      await applyStoredLanguage();
      return true;
    },
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (status !== 'pending') SplashScreen.hide();
  }, [status]);

  if (status === 'pending') return null;
  if (status === 'error') {
    return <ErrorState title={t('app.databaseError')} error={error} onRetry={() => refetch()} />;
  }
  return children;
}
