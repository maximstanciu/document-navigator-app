import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { useTheme } from '@/hooks/use-theme';
import { localCalendarDate, localNoon } from '@/shared/calendar-date';

import type { DatePickerProps } from './date-picker';

/**
 * Android: the system date dialog (Material 3 through `@expo/ui`), which opens as soon as this
 * renders and has its own «OK» and «Cancel». Either one must unmount it: the caller does so in
 * `onConfirm` and `onCancel`.
 */
export function DatePicker({ value, onConfirm, onCancel }: DatePickerProps) {
  const theme = useTheme();

  return (
    <DateTimePicker
      value={localNoon(value)}
      mode="date"
      presentation="dialog"
      accentColor={theme.tint}
      onValueChange={(_, date) => onConfirm(localCalendarDate(date))}
      onDismiss={onCancel}
    />
  );
}
