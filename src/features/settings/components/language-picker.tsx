import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { settingsQuery } from '@/lib/db/settings-query';
import type { InterfaceLocale } from '@/lib/db/types';

import { useUpdateSettings } from '../queries';

const OPTIONS: InterfaceLocale[] = ['system', 'ru', 'en'];

/** Interface language: system, Russian or English (SET-1). */
export function LanguagePicker() {
  const { t } = useTranslation();
  const { data: settings } = useQuery(settingsQuery());
  const updateSettings = useUpdateSettings();
  const selected = updateSettings.variables?.locale ?? settings?.locale ?? 'system';

  return (
    <View style={styles.group} role="radiogroup" aria-label={t('settings.language')}>
      <ThemedText type="smallBold">{t('settings.language')}</ThemedText>
      {OPTIONS.map((option) => {
        const checked = option === selected;
        const label = t(`settings.languageOption.${option}`);
        return (
          <Pressable
            key={option}
            role="radio"
            aria-label={label}
            aria-checked={checked}
            disabled={updateSettings.isPending || !settings}
            onPress={() => updateSettings.mutate({ locale: option })}>
            {({ pressed }) => (
              <ThemedView
                type={checked || pressed ? 'backgroundSelected' : 'backgroundElement'}
                style={styles.option}>
                <ThemedText type="small">{label}</ThemedText>
                <ThemedText type="smallBold" aria-hidden>
                  {checked ? '✓' : ''}
                </ThemedText>
              </ThemedView>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  option: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
});
