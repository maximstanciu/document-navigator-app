import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import {
  PICKER_MODES,
  PickerButtons,
  type PickerMode,
  type PickerProps,
} from './date-time-picker-parts';

/**
 * Web preview: `@expo/ui` has no date or time picker on web, so the value is typed (`YYYY-MM-DD`,
 * `HH:mm`) and checked on «Save». Jest uses this one too: the native pickers can't run there.
 */
function TextPicker({
  mode,
  value,
  label,
  onConfirm,
  onCancel,
}: PickerProps & { mode: PickerMode }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  const [invalid, setInvalid] = useState(false);

  const save = () => {
    const typed = text.trim();
    if (PICKER_MODES[mode].isValid(typed)) onConfirm(typed);
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
        placeholder={t(`${mode}Picker.placeholder`)}
        placeholderTextColor={theme.textSecondary}
        autoFocus
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.background, borderColor: theme.tint },
        ]}
      />
      {invalid && (
        <ThemedText type="small" role="alert" style={{ color: theme.riskHigh }}>
          {t(`${mode}Picker.invalid`)}
        </ThemedText>
      )}
      <PickerButtons onSave={save} onCancel={onCancel} />
    </View>
  );
}

/** Picks a calendar date (`YYYY-MM-DD`). */
export function DatePicker(props: PickerProps) {
  return <TextPicker mode="date" {...props} />;
}

/** Picks a time of day (`HH:mm`). */
export function TimePicker(props: PickerProps) {
  return <TextPicker mode="time" {...props} />;
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
});
