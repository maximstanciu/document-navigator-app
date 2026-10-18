import { DateTimePicker } from '@expo/ui/community/datetime-picker';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { localCalendarDate, localNoon } from '@/shared/calendar-date';

export type DatePickerProps = {
  /** The date to start from, `YYYY-MM-DD`. */
  value: string;
  /** What the date is for, for screen readers. */
  label: string;
  onConfirm: (date: string) => void;
  onCancel: () => void;
};

/**
 * Picks a calendar date (`YYYY-MM-DD`). iOS: the system calendar inline (SwiftUI through
 * `@expo/ui`), which reports every tap, so the choice is confirmed with «Save». Android has the
 * system dialog (date-picker.android.tsx), web a text field (date-picker.web.tsx).
 */
export function DatePicker({ value, label, onConfirm, onCancel }: DatePickerProps) {
  const theme = useTheme();
  const scheme = useColorScheme();
  const { t, i18n } = useTranslation();
  const [selected, setSelected] = useState(() => localNoon(value));

  return (
    <View style={styles.container} aria-label={label}>
      <DateTimePicker
        value={selected}
        mode="date"
        display="inline"
        locale={i18n.language}
        accentColor={theme.tint}
        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
        onValueChange={(_, date) => setSelected(date)}
      />
      <View style={styles.buttons}>
        <Button label={t('common.save')} onPress={() => onConfirm(localCalendarDate(selected))} />
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
