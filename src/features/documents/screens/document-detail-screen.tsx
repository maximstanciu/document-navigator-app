import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AnalysisStatusPanel } from '@/features/analysis/components/analysis-status-panel';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate, formatTimestampDate } from '@/lib/i18n/format';

import { DocumentResult } from '../components/document-result';
import { OriginalBlock } from '../components/original-block';
import { displayTitle, formatDocumentType } from '../format';
import { documentQueries } from '../queries';
import type { DocumentDetail } from '../types';

/** «Invoice · Stadtwerke · 3 Oct 2026» (DET-1); before the analysis, when it was added. */
function documentMeta(document: DocumentDetail, t: TFunction, language: string) {
  if (!document.analysis) {
    return t('documents.addedOn', { date: formatTimestampDate(document.createdAt, language) });
  }
  return [
    formatDocumentType(document.documentType, t),
    document.senderName,
    document.documentDate ? formatCalendarDate(document.documentDate, language) : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * A document (SPEC §4.4): the title, where its analysis stands, the analysis itself in the order of
 * the four questions (DET-1…DET-10), the original and the disclaimer.
 */
export function DocumentDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { data, error, isPending, refetch } = useQuery(documentQueries.detail(id));

  if (isPending) return <LoadingState label={t('documents.loadingOne')} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState title={t('documents.notFoundTitle')} message={t('documents.notFoundMessage')} />
      </>
    );
  }

  const title = displayTitle(data.title, t);
  const meta = documentMeta(data, t, i18n.language);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title }} />
      <ThemedText type="subtitle" role="heading">
        {title}
      </ThemedText>
      {meta !== '' && (
        <ThemedText type="small" themeColor="textSecondary">
          {meta}
        </ThemedText>
      )}
      <AnalysisStatusPanel document={data} />
      {data.analysis && <DocumentResult documentId={data.id} analysis={data.analysis} />}
      <OriginalBlock document={data} />
      {data.analysis && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.disclaimer')}
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.four,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
});
