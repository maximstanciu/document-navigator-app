import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState } from '@/components/screen-state';
import { Section } from '@/components/section';
import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { RemainingAnalyses } from '@/features/analysis/components/remaining-analyses';
import { settingsQuery } from '@/lib/db/settings-query';
import { env } from '@/lib/env';

import { AppLockSetting } from '../components/app-lock-setting';
import { DeleteAllData } from '../components/delete-all-data';
import { DocumentCountryPicker } from '../components/document-country-picker';
import { ExplanationLanguagePicker, LanguagePicker } from '../components/language-picker';
import { ReminderSettings } from '../components/reminder-settings';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.value} numberOfLines={1}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Settings (SET-1…SET-8): languages, default reminders, what is left of today's analyses, the app
 * lock, «Delete all data», and the disclaimer with the version. The privacy policy link comes with the policy
 * itself (task 6.4).
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const bottomInset = useBottomTabInset();
  const { isPending, error, refetch } = useQuery(settingsQuery());

  let content;
  if (isPending) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState error={error} onRetry={() => refetch()} />;
  } else {
    content = (
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}>
        <Section gap={Spacing.three} title={t('settings.sections.language')}>
          <LanguagePicker />
          <ExplanationLanguagePicker />
        </Section>
        <Section gap={Spacing.three} title={t('settings.sections.reminders')}>
          <ReminderSettings />
        </Section>
        <Section gap={Spacing.three} title={t('settings.sections.analysis')}>
          <DocumentCountryPicker />
          <RemainingAnalyses />
        </Section>
        <AppLockSetting />
        <Section gap={Spacing.three} title={t('settings.sections.data')}>
          <DeleteAllData />
        </Section>
        <Section gap={Spacing.three} title={t('settings.sections.about')}>
          <ThemedText type="small" themeColor="textMuted">
            {t('documents.disclaimer')}
          </ThemedText>
          <InfoRow
            label={t('settings.version')}
            value={Constants.expoConfig?.version ?? t('settings.unknown')}
          />
          <InfoRow label={t('settings.api')} value={env.apiUrl || t('settings.apiNotConfigured')} />
        </Section>
      </ScrollView>
    );
  }

  return <TabScreen>{content}</TabScreen>;
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.five,
    paddingTop: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
