import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { getCalendars } from 'expo-localization';

import { useTheme } from '@/hooks/use-theme';

import { PICKER_MODES, type PickerMode, type PickerProps } from './date-time-picker-parts';

/**
 * Android: the system dialog (Material 3 through `@expo/ui`), the time in the phone's 12- or
 * 24-hour format. It opens as soon as this renders and has its own «OK» and «Cancel». Either one
 * must unmount it: the caller does so in `onConfirm` and `onCancel`.
 */
function DialogPicker({ mode, value, onConfirm, onCancel }: PickerProps & { mode: PickerMode }) {
  const theme = useTheme();
  const { toDate, fromDate } = PICKER_MODES[mode];

  return (
    <DateTimePicker
      value={toDate(value)}
      mode={mode}
      presentation="dialog"
      is24Hour={mode === 'time' ? (getCalendars()[0]?.uses24hourClock ?? true) : undefined}
      accentColor={theme.tint}
      onValueChange={(_, date) => onConfirm(fromDate(date))}
      onDismiss={onCancel}
    />
  );
}

/** Picks a calendar date (`YYYY-MM-DD`). */
export function DatePicker(props: PickerProps) {
  return <DialogPicker mode="date" {...props} />;
}

/** Picks a time of day (`HH:mm`). */
export function TimePicker(props: PickerProps) {
  return <DialogPicker mode="time" {...props} />;
}
