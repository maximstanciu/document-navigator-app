import { useTranslation } from 'react-i18next';

import type { InterfaceLocale } from '@/lib/db/types';
import { EXPLANATION_LOCALES, type ExplanationLocale } from '@/shared/explanation-locales';

import { SettingChoice } from './setting-choice';

const INTERFACE_OPTIONS: InterfaceLocale[] = ['system', 'ru', 'en'];

/** Interface language: system, Russian or English (SET-1). */
export function LanguagePicker() {
  const { t } = useTranslation();

  return (
    <SettingChoice
      label={t('settings.language')}
      options={INTERFACE_OPTIONS.map((value) => ({
        value,
        label: t(`settings.languageOption.${value}`),
      }))}
      value={(settings) => settings?.locale ?? 'system'}
      toPatch={(locale) => ({ locale })}
    />
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

  return (
    <SettingChoice
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
      value={(settings) => settings?.explanationLocale ?? 'interface'}
      toPatch={(choice) => ({ explanationLocale: choice === 'interface' ? null : choice })}
    />
  );
}
