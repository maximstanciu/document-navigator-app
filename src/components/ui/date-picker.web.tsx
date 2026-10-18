import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isCalendarDate } from '@/shared/calendar-date';

import type { DatePickerProps } from './date-picker';

/**
 * Web preview: `@expo/ui` has no date picker on web, so the date is typed as `YYYY-MM-DD`. Jest uses
 * this one too, since the native pickers can't run there.
 */
export function DatePicker({ value, label, onConfirm, onCancel }: DatePickerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const date = text.trim();
    if (isCalendarDate(date)) onConfirm(date);
    else setInvalid(true);
  };

  return (
    <View style={styles.container}>
      <TextInput
        aria-label={label}
        value={text}
        onChangeText={(next) => {
          setText(next);
          setInvalid(false);
        }}
        onSubmitEditing={save}
        placeholder={t('datePicker.placeholder')}
        placeholderTextColor={theme.textSecondary}
        autoFocus
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.tint },
        ]}
      />
      {invalid && (
        <ThemedText type="small" role="alert" style={{ color: theme.riskHigh }}>
          {t('datePicker.invalid')}
        </ThemedText>
      )}
      <View style={styles.buttons}>
        <Button label={t('common.save')} onPress={save} />
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  input: {
    minHeight: MinTouchTarget,
    fontSize: 16,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
