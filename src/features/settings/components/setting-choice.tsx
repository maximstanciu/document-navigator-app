import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { Settings } from '@/lib/db/types';

import { useSettings } from '../queries';
import { RadioGroup, type RadioGroupProps } from './radio-group';

type SettingChoiceProps<T extends string> = Pick<
  RadioGroupProps<T>,
  'label' | 'hint' | 'options'
> & {
  /** The option the settings stand for; `settings` is `undefined` until they are read. */
  value: (settings: Settings | undefined) => T;
  /** The change to save when `option` is picked. */
  toPatch: (option: T) => Partial<Settings>;
};

/**
 * A setting picked out of a few options (SET-1, SET-6): saved as soon as it is tapped, shown picked
 * at once, and back to what is stored, with a notice, if saving fails.
 */
export function SettingChoice<T extends string>({
  value,
  toPatch,
  ...group
}: SettingChoiceProps<T>) {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  return (
    <View style={styles.container}>
      <RadioGroup
        {...group}
        selected={value(settings)}
        disabled={update.isPending || !settings}
        onSelect={(option) => update.mutate(toPatch(option))}
      />
      {update.isError && (
        <ThemedText type="small" role="alert">
          {t('settings.saveFailed')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
