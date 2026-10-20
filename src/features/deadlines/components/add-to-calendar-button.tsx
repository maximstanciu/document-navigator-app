import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { formatCalendarDate } from '@/lib/i18n/format';
import { localCalendarDate } from '@/shared/calendar-date';

import { isCalendarAvailable, openCalendarEventForm, openCalendarSettings } from '../calendar';
import { calendarEventFor } from '../calendar-event';

type AddToCalendarButtonProps = {
  deadline: DeadlineRecord;
  /** The deadline's actions (DET-3): the open ones go into the event's notes. */
  actions?: readonly ActionRecord[];
  documentTitle: string;
};

/**
 * «Add to calendar» on an open deadline that hasn't passed (REM-10, DET-4): the system event form,
 * filled in. Nothing is said once the form closes, since whether the person saved the event can't be
 * known; a missing calendar app or denied access is explained. Nothing on web.
 */
export function AddToCalendarButton({
  deadline,
  actions = [],
  documentTitle,
}: AddToCalendarButtonProps) {
  const { t, i18n } = useTranslation();
  const open = useMutation({ mutationFn: openCalendarEventForm });

  if (
    !isCalendarAvailable() ||
    deadline.status !== 'open' ||
    deadline.dueDate < localCalendarDate(new Date())
  ) {
    return null;
  }

  const date = formatCalendarDate(deadline.dueDate, i18n.language);
  return (
    <View style={styles.container}>
      <Button
        label={t('deadlines.calendar.add')}
        aria-label={t('deadlines.calendar.addLabel', { description: deadline.description, date })}
        variant="plain"
        // The form is open meanwhile; Android can't open a second one on top.
        disabled={open.isPending}
        onPress={() => open.mutate(calendarEventFor(deadline, actions, documentTitle, t))}
      />
      {open.data === 'no-calendar-app' && (
        <ThemedText type="small" role="alert">
          {t('deadlines.calendar.noApp')}
        </ThemedText>
      )}
      {open.data === 'denied' && (
        <View style={styles.container}>
          <ThemedText type="small" role="alert">
            {t('deadlines.calendar.denied')}
          </ThemedText>
          <Button
            label={t('deadlines.calendar.openSettings')}
            variant="plain"
            onPress={() => void openCalendarSettings()}
          />
        </View>
      )}
      {open.isError && (
        <ThemedText type="small" role="alert">
          {t('deadlines.calendar.failed')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'flex-start',
    gap: Spacing.one,
  },
});
