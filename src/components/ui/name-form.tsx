import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type NameFormProps = {
  name: string;
  /** The field's accessible name. */
  label: string;
  maxLength: number;
  placeholder?: string;
  /** «Save» unless given. */
  saveLabel?: string;
  /** While the name is being saved: both buttons wait. */
  busy?: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
};

/** A name typed in place of a title («Rename», «New case»): a blank name can't be saved. */
export function NameForm({
  name,
  label,
  maxLength,
  placeholder,
  saveLabel,
  busy = false,
  onSave,
  onCancel,
}: NameFormProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(name);
  const canSave = value.trim() !== '' && !busy;
  const save = () => {
    if (canSave) onSave(value.trim());
  };

  return (
    <View style={styles.form}>
      <TextInput
        aria-label={label}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={save}
        maxLength={maxLength}
        placeholder={placeholder}
        placeholderTextColor={theme.textSecondary}
        autoFocus
        enterKeyHint="done"
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.tint },
        ]}
      />
      <View style={styles.buttons}>
        <Button label={saveLabel ?? t('common.save')} disabled={!canSave} onPress={save} />
        <Button label={t('common.cancel')} variant="secondary" disabled={busy} onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: Spacing.two,
  },
  input: {
    minHeight: MinTouchTarget,
    fontSize: 20,
    fontWeight: 600,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
    borderWidth: 2,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
