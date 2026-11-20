import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { TimePicker } from '@/components/ui/date-time-picker';
import { Spacing } from '@/constants/theme';
import { PREPARATION_OFFSET_DAYS } from '@/features/reminders/plan-reminders';
import { formatClockTime } from '@/lib/i18n/format';

import { useSettings } from '../queries';
import { ChoiceRow } from './choice-row';
import { SwitchRow } from './switch-row';

/** Days before a deadline the app offers to remind on; the default is 7, 1 and 0 (REM-2). */
const OFFSET_OPTIONS = [14, 7, 3, 1, 0];

const latestFirst = (a: number, b: number) => b - a;

/**
 * Default reminders (SET-2): the days before a deadline and the time, for every deadline whose own
 * reminders aren't changed (REM-3). At least one day stays chosen: a deadline's «Remind me» brings
 * back these defaults, so none would leave it nothing to bring back. Unless 14 days is among them, a
 * hint says replies, submissions and cancellations get it anyway (REM-14). Then «Remind me if a
 * deadline has passed» (SET-7, REM-13) and «Details in notifications» (SET-5, REM-12). Every change
 * reschedules the reminders (`useUpdateSettings()`).
 */
export function ReminderSettings() {
  const { t, i18n } = useTranslation();
  const { settings, update } = useSettings();
  const [changingTime, setChangingTime] = useState(false);
  if (!settings) return null;

  const offsets = settings.reminderOffsetsDays;
  const options = [...new Set([...OFFSET_OPTIONS, ...offsets])].sort(latestFirst);
  const toggle = (days: number) =>
    update.mutate({
      reminderOffsetsDays: offsets.includes(days)
        ? offsets.filter((offset) => offset !== days)
        : [...offsets, days].sort(latestFirst),
    });
  const time = formatClockTime(settings.reminderTime, i18n.language);

  return (
    <View style={styles.container}>
      <View style={styles.group} role="group" aria-label={t('settings.reminders.offsets')}>
        <ThemedText type="smallBold">{t('settings.reminders.offsets')}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('settings.reminders.offsetsHint')}
        </ThemedText>
        {options.map((days) => {
          const checked = offsets.includes(days);
          return (
            <ChoiceRow
              key={days}
              role="checkbox"
              label={
                days === 0
                  ? t('settings.reminders.offsetSameDay')
                  : t('settings.reminders.offset', { count: days })
              }
              checked={checked}
              disabled={update.isPending || (checked && offsets.length === 1)}
              onPress={() => toggle(days)}
            />
          );
        })}
        {offsets.length === 1 && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('settings.reminders.lastOffset')}
          </ThemedText>
        )}
        {!offsets.includes(PREPARATION_OFFSET_DAYS) && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('settings.reminders.preparationHint', { count: PREPARATION_OFFSET_DAYS })}
          </ThemedText>
        )}
      </View>

      <SwitchRow
        label={t('settings.reminders.overdue')}
        hint={t('settings.reminders.overdueHint')}
        value={settings.overdueReminder}
        disabled={update.isPending}
        onValueChange={(overdueReminder) => update.mutate({ overdueReminder })}
      />

      <View style={styles.row}>
        <View style={styles.text}>
          <ThemedText type="smallBold">{t('settings.reminders.time')}</ThemedText>
          <ThemedText type="small">{time}</ThemedText>
        </View>
        {!changingTime && (
          <Button
            label={t('settings.reminders.changeTime')}
            aria-label={t('settings.reminders.changeTimeLabel', { time })}
            variant="plain"
            disabled={update.isPending}
            onPress={() => setChangingTime(true)}
          />
        )}
      </View>
      {changingTime && (
        <TimePicker
          value={settings.reminderTime}
          label={t('settings.reminders.time')}
          onConfirm={(reminderTime) => {
            setChangingTime(false);
            if (reminderTime !== settings.reminderTime) update.mutate({ reminderTime });
          }}
          onCancel={() => setChangingTime(false)}
        />
      )}

      <SwitchRow
        label={t('settings.reminders.details')}
        hint={t('settings.reminders.detailsHint')}
        value={settings.notificationDetails}
        disabled={update.isPending}
        onValueChange={(notificationDetails) => update.mutate({ notificationDetails })}
      />

      {update.isError && (
        <ThemedText type="small" role="alert">
          {t('settings.saveFailed')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.four,
  },
  group: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.one,
  },
});
