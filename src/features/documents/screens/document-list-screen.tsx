import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';

import { AddDocumentButton } from '../components/add-document-button';
import { DocumentListItem } from '../components/document-list-item';
import { documentQueries } from '../queries';

export function DocumentListScreen() {
  const { t } = useTranslation();
  const { data, error, isPending, refetch } = useQuery(documentQueries.list());

  if (isPending) return <LoadingState label={t('documents.loadingList')} />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Outside the list, so «Add» stays in reach however far the list is scrolled. */}
        <View style={styles.header}>
          <ThemedText type="subtitle" role="heading" style={styles.heading}>
            {t('documents.title')}
          </ThemedText>
          <AddDocumentButton />
        </View>
        <FlatList
          data={data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <DocumentListItem document={item} />}
          ListEmptyComponent={
            <EmptyState title={t('documents.emptyTitle')} message={t('documents.emptyMessage')} />
          }
          contentContainerStyle={styles.content}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: TopTabInset + Spacing.three,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  heading: {
    flexShrink: 1,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
});
