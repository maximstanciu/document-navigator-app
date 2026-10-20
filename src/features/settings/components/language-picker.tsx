import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { InterfaceLocale } from '@/lib/db/types';
import { EXPLANATION_LOCALES, type ExplanationLocale } from '@/shared/explanation-locales';

import { useSettings } from '../queries';
import { RadioGroup } from './radio-group';

const INTERFACE_OPTIONS: InterfaceLocale[] = ['system', 'ru', 'en'];

/** Interface language: system, Russian or English (SET-1). */
export function LanguagePicker() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  return (
    <View style={styles.container}>
      <RadioGroup
        label={t('settings.language')}
        options={INTERFACE_OPTIONS.map((value) => ({
          value,
          label: t(`settings.languageOption.${value}`),
        }))}
        selected={settings?.locale ?? 'system'}
        disabled={update.isPending || !settings}
        onSelect={(locale) => update.mutate({ locale })}
      />
      {update.isError && (
        <ThemedText type="small" role="alert">
          {t('settings.saveFailed')}
        </ThemedText>
      )}
    </View>
  );
}

type ExplanationChoice = 'interface' | ExplanationLocale;

const EXPLANATION_OPTIONS: ExplanationChoice[] = ['interface', ...EXPLANATION_LOCALES];

/**
 * «Explanation language» (SET-1, D-5): the language analyses are explained in, by default the
 * interface language (`null` in settings). Applies to the next analysis.
 */
export function ExplanationLanguagePicker() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  return (
    <View style={styles.container}>
      <RadioGroup
        label={t('settings.explanationLanguage')}
        hint={t('settings.explanationLanguageHint')}
        options={EXPLANATION_OPTIONS.map((value) => {
          const label = t(`settings.explanationLanguageOption.${value}`);
          // «Русский» and «English» are in the interface language group above too.
          return {
            value,
            label,
            name: t('settings.explanationLanguageOptionName', { option: label }),
          };
        })}
        selected={settings?.explanationLocale ?? 'interface'}
        disabled={update.isPending || !settings}
        onSelect={(choice) =>
          update.mutate({ explanationLocale: choice === 'interface' ? null : choice })
        }
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
