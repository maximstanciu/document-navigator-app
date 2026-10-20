import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { clockTime, todayAt } from '@/shared/calendar-date';

export type TimePickerProps = {
  /** The time to start from, `HH:mm`. */
  value: string;
  /** What the time is for, for screen readers. */
  label: string;
  onConfirm: (time: string) => void;
  onCancel: () => void;
};

/**
 * Picks a time of day (`HH:mm`). iOS: the system wheels inline (SwiftUI through `@expo/ui`), which
 * report every turn, so the choice is confirmed with «Save». Android has the system dialog
 * (time-picker.android.tsx), web a text field (time-picker.web.tsx).
 */
export function TimePicker({ value, label, onConfirm, onCancel }: TimePickerProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => todayAt(value));

  return (
    <View style={styles.container} aria-label={label}>
      <DateTimePicker
        value={selected}
        mode="time"
        display="spinner"
        locale={i18n.language}
        accentColor={theme.tint}
        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        onValueChange={(_, date) => setSelected(date)}
      />
      <View style={styles.buttons}>
        <Button label={t('common.save')} onPress={() => onConfirm(clockTime(selected))} />
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
