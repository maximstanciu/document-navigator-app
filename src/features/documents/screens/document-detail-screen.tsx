import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { formatPageCount, formatUpdatedAt } from '../format';
import { documentQueries } from '../queries';

export function DocumentDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { data, error, isPending, refetch } = useQuery(documentQueries.detail(id));

  if (isPending) return <LoadingState label="Loading document" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic">
      <Stack.Screen options={{ title: data.title }} />
      <ThemedText type="subtitle" role="heading">
        {data.title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Updated {formatUpdatedAt(data.updatedAt)} · {formatPageCount(data.pageCount)}
      </ThemedText>
      {data.tags.length > 0 && (
        <ThemedView style={styles.tags}>
          {data.tags.map((tag) => (
            <ThemedView key={tag} type="backgroundElement" style={styles.tag}>
              <ThemedText type="small">{tag}</ThemedText>
            </ThemedView>
          ))}
        </ThemedView>
      )}
      <ThemedText>{data.body}</ThemedText>
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
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
});
