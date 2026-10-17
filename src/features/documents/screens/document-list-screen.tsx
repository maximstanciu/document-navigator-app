import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

import { DocumentListItem } from '../components/document-list-item';
import { documentQueries } from '../queries';

export function DocumentListScreen() {
  const { data, error, isPending, isRefetching, refetch } = useQuery(documentQueries.list());

  if (isPending) return <LoadingState label="Loading documents" />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DocumentListItem document={item} />}
          ListHeaderComponent={
            <ThemedText type="subtitle" role="heading" style={styles.heading}>
              Documents
            </ThemedText>
          }
          ListEmptyComponent={
            <EmptyState title="No documents yet" message="Documents you add will show up here." />
          }
          contentContainerStyle={styles.content}
          onRefresh={refetch}
          refreshing={isRefetching}
        />
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
    paddingBottom: Spacing.two,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
});
