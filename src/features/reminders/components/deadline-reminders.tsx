import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { settingsQuery } from '@/lib/db/settings-query';
import type { DeadlineRecord } from '@/lib/db/types';
import { formatCalendarDate, formatTimestampDateTime } from '@/lib/i18n/format';

import { openNotificationSettings } from '../notifications';
import { planReminders } from '../plan-reminders';
import { reminderQueries, useTurnOffReminders, useTurnOnReminders } from '../queries';

/**
 * The reminders of an open deadline on its card (DET-4, REM-3, REM-5). On: when they will come,
 * with «Don't remind». Off, or without the permission: «Remind», which asks for the permission the
 * first time and explains how to allow notifications if it is denied. Nothing on web, for a closed
 * or overdue deadline, or once every reminder time has passed.
 */
export function DeadlineReminders({ deadline }: { deadline: DeadlineRecord }) {
  const { t, i18n } = useTranslation();
  const { data: permission } = useQuery(reminderQueries.permission());
  const { data: settings } = useQuery(settingsQuery());
  const turnOn = useTurnOnReminders();
  const turnOff = useTurnOffReminders();

  if (!permission || permission === 'unavailable' || !settings || deadline.status !== 'open') {
    return null;
  }
  const off = deadline.reminderOffsetsDays?.length === 0;
  // What the deadline gets with reminders on: its own offsets, or the defaults if they are off.
  const upcoming = planReminders(
    [off ? { ...deadline, reminderOffsetsDays: null } : deadline],
    { ...settings, language: i18n.language },
    new Date()
  );
  if (upcoming.length === 0) return null;

  const date = formatCalendarDate(deadline.dueDate, i18n.language);
  const failed = (turnOn.isError || turnOff.isError) && (
    <ThemedText type="small" role="alert">
      {t('reminders.deadline.failed')}
    </ThemedText>
  );

  if (permission === 'granted' && !off) {
    const times = upcoming.map((reminder) =>
      formatTimestampDateTime(reminder.fireAt, i18n.language)
    );
    return (
      <View style={styles.container}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('reminders.deadline.scheduled', { times: times.join(' · ') })}
        </ThemedText>
        <Button
          label={t('reminders.deadline.turnOff')}
          aria-label={t('reminders.deadline.turnOffLabel', { date })}
          variant="plain"
          disabled={turnOff.isPending}
          onPress={() => turnOff.mutate(deadline.id)}
        />
        {failed}
      </View>
    );
  }

  // Only after the person pressed «Remind», and only while the permission is still missing: it may
  // have been granted in system settings since.
  const denied = turnOn.isSuccess && permission !== 'granted';
  return (
    <View style={styles.container}>
      <Button
        label={t('reminders.deadline.turnOn')}
        aria-label={t('reminders.deadline.turnOnLabel', { date })}
        variant="plain"
        disabled={turnOn.isPending}
        onPress={() => turnOn.mutate(deadline)}
      />
      {denied && (
        <View style={styles.container}>
          <ThemedText type="small" role="alert">
            {t('reminders.deadline.denied')}
          </ThemedText>
          <Button
            label={t('reminders.deadline.openSettings')}
            variant="plain"
            onPress={() => void openNotificationSettings()}
          />
        </View>
      )}
      {failed}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
});
