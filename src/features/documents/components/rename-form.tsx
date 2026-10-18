import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ANALYSIS_BOUNDS } from '@/shared/analysis/schema';

type RenameFormProps = {
  title: string;
  onSave: (title: string) => void;
  onCancel: () => void;
};

/** «Rename» (DET-9) in place of the title: a blank title can't be saved. */
export function RenameForm({ title, onSave, onCancel }: RenameFormProps) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [value, setValue] = useState(title);
  const canSave = value.trim() !== '';
  const save = () => {
    if (canSave) onSave(value.trim());
  };

  return (
    <View style={styles.form}>
      <TextInput
        aria-label={t('documents.rename.label')}
        value={value}
        onChangeText={setValue}
        onSubmitEditing={save}
        maxLength={ANALYSIS_BOUNDS.title}
        autoFocus
        enterKeyHint="done"
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.tint },
        ]}
      />
      <View style={styles.buttons}>
        <Button label={t('common.save')} disabled={!canSave} onPress={save} />
        <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
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
