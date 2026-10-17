import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { displayTitle, formatDate, formatPageCount, formatStatus } from '../format';
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

/** Basic document facts from SQLite; the analysis blocks (DET-1…DET-10) arrive in task 4.2. */
export function DocumentDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { data, error, isPending, refetch } = useQuery(documentQueries.detail(id));

  if (isPending) return <LoadingState label="Loading document" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: '' }} />
        <EmptyState title="Document not found" message="It may have been deleted." />
      </>
    );
  }

  const title = displayTitle(data.title);
  const pageCount = formatPageCount(data.pageCount);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title }} />
      <ThemedText type="subtitle" role="heading">
        {title}
      </ThemedText>
      <ThemedView style={styles.rows}>
        <InfoRow label="Status" value={formatStatus(data.status)} />
        {data.senderName && <InfoRow label="From" value={data.senderName} />}
        {data.documentDate && (
          <InfoRow label="Document date" value={formatDate(data.documentDate)} />
        )}
        <InfoRow label="Added" value={formatDate(data.createdAt)} />
        <InfoRow
          label="Type"
          value={data.mimeType === 'application/pdf' ? 'PDF' : 'Photo or scan'}
        />
        {pageCount && <InfoRow label="Pages" value={pageCount} />}
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
