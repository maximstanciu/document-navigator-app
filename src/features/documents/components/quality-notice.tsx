import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import type { AnalysisResult } from '@/shared/analysis/schema';

/** An unreadable page or not a document (ANL-7): what got in the way and an offer to retake it. */
export function QualityNotice({ issues }: { issues: AnalysisResult['quality']['issues'] }) {
  const { t } = useTranslation();
  // Intl.ListFormat is missing in Hermes (spike 0.7); a comma reads well in both languages.
  const named = issues.map((issue) => t(`documents.quality.issue.${issue}`)).join(', ');

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="smallBold" role="heading">
        {t('documents.quality.title')}
      </ThemedText>
      {named && (
        <ThemedText type="small">{t('documents.quality.issues', { issues: named })}</ThemedText>
      )}
      <ThemedText type="small">{t('documents.quality.advice')}</ThemedText>
      <Button label={t('documents.quality.addAgain')} onPress={() => router.push('/capture')} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
