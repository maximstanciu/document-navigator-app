import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

import {
  PICKER_MODES,
  PickerButtons,
  type PickerMode,
  type PickerProps,
} from './date-time-picker-parts';

/** The calendar shows whole; the time turns on wheels. */
const DISPLAY = { date: 'inline', time: 'spinner' } as const;

/**
 * iOS: the system picker inline (SwiftUI through `@expo/ui`), which reports every tap or turn, so
 * the choice is confirmed with «Save». Android has the system dialog
 * (date-time-picker.android.tsx), web a text field (date-time-picker.web.tsx).
 */
function InlinePicker({
  mode,
  value,
  label,
  onConfirm,
  onCancel,
}: PickerProps & { mode: PickerMode }) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { i18n } = useTranslation();
  const { toDate, fromDate } = PICKER_MODES[mode];
  const [selected, setSelected] = useState(() => toDate(value));

  return (
    <View style={styles.container} aria-label={label}>
      <DateTimePicker
        value={selected}
        mode={mode}
        display={DISPLAY[mode]}
        locale={i18n.language}
        accentColor={theme.tint}
        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        onValueChange={(_, date) => setSelected(date)}
      />
      <PickerButtons onSave={() => onConfirm(fromDate(selected))} onCancel={onCancel} />
    </View>
  );
}

/** Picks a calendar date (`YYYY-MM-DD`). */
export function DatePicker(props: PickerProps) {
  return <InlinePicker mode="date" {...props} />;
}

/** Picks a time of day (`HH:mm`). */
export function TimePicker(props: PickerProps) {
  return <InlinePicker mode="time" {...props} />;
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
