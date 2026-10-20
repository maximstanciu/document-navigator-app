import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { RemainingAnalyses } from '@/features/analysis/components/remaining-analyses';
import { settingsQuery } from '@/lib/db/settings-query';
import { env } from '@/lib/env';

import { DeleteAllData } from '../components/delete-all-data';
import { ExplanationLanguagePicker, LanguagePicker } from '../components/language-picker';
import { ReminderSettings } from '../components/reminder-settings';
import { SettingsSection } from '../components/settings-section';

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
 * Settings (SET-1…SET-5): languages, default reminders, what is left of today's analyses, «Delete
 * all data», and the disclaimer with the version. The privacy policy link comes with the policy
 * itself (task 6.4).
 */
export function SettingsScreen() {
  const { t } = useTranslation();
  const { isPending, error, refetch } = useQuery(settingsQuery());

  let content;
  if (isPending) {
    content = <LoadingState />;
  } else if (error) {
    content = <ErrorState error={error} onRetry={() => refetch()} />;
  } else {
    content = (
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="subtitle" role="heading" style={styles.heading}>
          {t('settings.title')}
        </ThemedText>
        <SettingsSection title={t('settings.sections.language')}>
          <LanguagePicker />
          <ExplanationLanguagePicker />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.reminders')}>
          <ReminderSettings />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.analysis')}>
          <RemainingAnalyses />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.data')}>
          <DeleteAllData />
        </SettingsSection>
        <SettingsSection title={t('settings.sections.about')}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('documents.disclaimer')}
          </ThemedText>
          <InfoRow
            label={t('settings.version')}
            value={Constants.expoConfig?.version ?? t('settings.unknown')}
          />
          <InfoRow label={t('settings.api')} value={env.apiUrl || t('settings.apiNotConfigured')} />
        </SettingsSection>
      </ScrollView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {content}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  heading: {
    paddingTop: TopTabInset + Spacing.three,
  },
  content: {
    gap: Spacing.five,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
