import { useTranslation } from 'react-i18next';

import type { DocumentCountryChoice } from '@/features/analysis/document-country';
import { MEMO_COUNTRIES } from '@/shared/legal-memo-countries';

import { SettingChoice } from './setting-choice';

type CountryOption = 'region' | DocumentCountryChoice;

const OPTIONS: CountryOption[] = ['region', ...MEMO_COUNTRIES, 'other'];

/**
 * «Country of documents» (SET-6, ANL-14): whose legal memo an analysis starts with — by default the
 * phone's region (`null` in settings), or none for «Another country». Applies to the next analysis.
 */
export function DocumentCountryPicker() {
  const { t } = useTranslation();

  return (
    <SettingChoice
      label={t('settings.documentCountry')}
      hint={t('settings.documentCountryHint')}
      options={OPTIONS.map((value) => {
        const label = t(`settings.documentCountryOption.${value}`);
        return { value, label, name: t('settings.documentCountryOptionName', { option: label }) };
      })}
      value={(settings) => settings?.documentCountry ?? 'region'}
      toPatch={(choice) => ({ documentCountry: choice === 'region' ? null : choice })}
    />
  );
}
