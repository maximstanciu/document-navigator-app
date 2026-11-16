import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import {
  clockTime,
  isCalendarDate,
  isClockTime,
  localCalendarDate,
  localNoon,
  todayAt,
} from '@/shared/calendar-date';

// What the platform pickers in date-time-picker.tsx (iOS), date-time-picker.android.tsx and
// date-time-picker.web.tsx share. Kept apart from them: an import of `./date-time-picker` resolves
// to the platform's own file.

export type PickerProps = {
  /** The value to start from: `YYYY-MM-DD` for a date, `HH:mm` for a time. */
  value: string;
  /** What the value is for, for screen readers. */
  label: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
};

/** What a picker picks: a calendar date (`YYYY-MM-DD`) or a time of day (`HH:mm`). */
export type PickerMode = 'date' | 'time';

type ModeFormat = {
  /** The value as the moment the system pickers start from. */
  toDate: (value: string) => Date;
  /** The moment a system picker reported, as a value. */
  fromDate: (moment: Date) => string;
  /** Whether typed text is a value of this mode. */
  isValid: (text: string) => boolean;
};

export const PICKER_MODES: Record<PickerMode, ModeFormat> = {
  date: { toDate: localNoon, fromDate: localCalendarDate, isValid: isCalendarDate },
  time: { toDate: todayAt, fromDate: clockTime, isValid: isClockTime },
};

/** «Save» and «Cancel» under a picker that reports every change, so the choice is confirmed. */
export function PickerButtons({ onSave, onCancel }: { onSave: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.buttons}>
      <Button label={t('common.save')} onPress={onSave} />
      <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
    </View>
  );
}

const styles = StyleSheet.create({
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
