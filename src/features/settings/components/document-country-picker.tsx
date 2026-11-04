import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import type { DocumentCountryChoice } from '@/features/analysis/document-country';
import { MEMO_COUNTRIES } from '@/shared/legal-memo-countries';

import { useSettings } from '../queries';
import { RadioGroup } from './radio-group';

type CountryOption = 'region' | DocumentCountryChoice;

const OPTIONS: CountryOption[] = ['region', ...MEMO_COUNTRIES, 'other'];

/**
 * «Country of documents» (SET-6, ANL-14): whose legal memo an analysis starts with — by default the
 * phone's region (`null` in settings), or none for «Another country». Applies to the next analysis.
 */
export function DocumentCountryPicker() {
  const { t } = useTranslation();
  const { settings, update } = useSettings();

  return (
    <View style={styles.container}>
      <RadioGroup
        label={t('settings.documentCountry')}
        hint={t('settings.documentCountryHint')}
        options={OPTIONS.map((value) => {
          const label = t(`settings.documentCountryOption.${value}`);
          return { value, label, name: t('settings.documentCountryOptionName', { option: label }) };
        })}
        selected={settings?.documentCountry ?? 'region'}
        disabled={update.isPending || !settings}
        onSelect={(choice) =>
          update.mutate({ documentCountry: choice === 'region' ? null : choice })
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
