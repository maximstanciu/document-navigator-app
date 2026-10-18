import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AnalysisStatusPanel } from '@/features/analysis/components/analysis-status-panel';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate, formatTimestampDate } from '@/lib/i18n/format';

import { displayTitle, formatPageCount, formatStatus } from '../format';
import { documentQueries } from '../queries';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedText type="small">{label}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.value}>
        {value}
      </ThemedText>
    </ThemedView>
  );
}

/**
 * Basic document facts from SQLite and where its analysis stands; the analysis blocks
 * (DET-1…DET-10) arrive in task 4.2.
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
  const pageCount = formatPageCount(data.pageCount, t);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title }} />
      <ThemedText type="subtitle" role="heading">
        {title}
      </ThemedText>
      <AnalysisStatusPanel document={data} />
      <ThemedView style={styles.rows}>
        <InfoRow label={t('documents.field.status')} value={formatStatus(data.status, t)} />
        {data.senderName && <InfoRow label={t('documents.field.from')} value={data.senderName} />}
        {data.documentDate && (
          <InfoRow
            label={t('documents.field.documentDate')}
            value={formatCalendarDate(data.documentDate, i18n.language)}
          />
        )}
        <InfoRow
          label={t('documents.field.added')}
          value={formatTimestampDate(data.createdAt, i18n.language)}
        />
        <InfoRow
          label={t('documents.field.type')}
          value={t(
            data.mimeType === 'application/pdf' ? 'documents.kind.pdf' : 'documents.kind.image'
          )}
        />
        {pageCount && <InfoRow label={t('documents.field.pages')} value={pageCount} />}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  rows: {
    gap: Spacing.two,
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
