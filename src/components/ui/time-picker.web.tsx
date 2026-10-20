import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isClockTime } from '@/shared/calendar-date';

import type { TimePickerProps } from './time-picker';

/**
 * Web preview: `@expo/ui` has no time picker on web, so the time is typed as `HH:mm`. Jest uses
 * this one too, since the native pickers can't run there.
 */
export function TimePicker({ value, label, onConfirm, onCancel }: TimePickerProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const time = text.trim();
    if (isClockTime(time)) onConfirm(time);
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
        placeholder={t('timePicker.placeholder')}
        placeholderTextColor={theme.textSecondary}
        autoFocus
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.tint },
        ]}
      />
      {invalid && (
        <ThemedText type="small" role="alert" style={{ color: theme.riskHigh }}>
          {t('timePicker.invalid')}
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
