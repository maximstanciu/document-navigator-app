import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { getCalendars } from 'expo-localization';

import { useTheme } from '@/hooks/use-theme';
import { clockTime, todayAt } from '@/shared/calendar-date';

import type { TimePickerProps } from './time-picker';

/**
 * Android: the system time dialog (Material 3 through `@expo/ui`) in the phone's 12- or 24-hour
 * format, which opens as soon as this renders and has its own «OK» and «Cancel». Either one must
 * unmount it: the caller does so in `onConfirm` and `onCancel`.
 */
export function TimePicker({ value, onConfirm, onCancel }: TimePickerProps) {
  const theme = useTheme();

  return (
    <DateTimePicker
      value={todayAt(value)}
      mode="time"
      presentation="dialog"
      is24Hour={getCalendars()[0]?.uses24hourClock ?? true}
      accentColor={theme.tint}
      onValueChange={(_, date) => onConfirm(clockTime(date))}
      onDismiss={onCancel}
    />
  );
}
