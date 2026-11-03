import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState } from 'react-native';

import { setUpNotifications } from '../notifications';
import { syncRemindersInBackground } from '../sync-reminders';

/**
 * Sets up notifications (both channels, the `analysis` one of ANL-12 too) and syncs reminders at
 * start, after a change of the interface language (the text and the channel names follow it) and
 * whenever the app returns to the foreground (REM-7): reminders fired meanwhile, the time zone may
 * have changed, the permission may have been granted or taken away in system settings. Asks for
 * nothing (REM-5). Mount once, inside the database gate.
 */
export function ReminderSync() {
  const { t } = useTranslation();

  useEffect(() => {
    const channels = {
      deadlines: {
        name: t('reminders.channel.name'),
        description: t('reminders.channel.description'),
      },
      analysis: {
        name: t('analysis.channel.name'),
        description: t('analysis.channel.description'),
      },
    };
    // Sync either way: a channel that failed to set up now gets another try at the next start.
    void setUpNotifications(channels)
      .catch(() => undefined)
      .then(syncRemindersInBackground);
  }, [t]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'active') syncRemindersInBackground();
    });
    return () => subscription.remove();
  }, []);

  return null;
}
