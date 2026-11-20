import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ContentColumn, Spacing } from '@/constants/theme';
import { archivedCases } from '@/features/cases/api';
import { ArchivedCaseRow } from '@/features/cases/components/archived-case-row';
import { caseQueries } from '@/features/cases/queries';
import { useTheme } from '@/hooks/use-theme';

import { documentQueries } from '../queries';

/**
 * The archive of cases (CASE-6), opened from «Archive» in the cases block: archived cases, the most
 * recently archived first, each with its number of documents. A case opens its own screen, where
 * it can be restored.
 */
export function ArchivedCasesScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const cases = useQuery(caseQueries.list());
  const documents = useQuery(documentQueries.list());

  if (cases.isPending || documents.isPending) {
    return <LoadingState label={t('cases.archive.loading')} />;
  }
  if (cases.isError || documents.isError) {
    return (
      <ErrorState
        error={cases.error ?? documents.error}
        onRetry={() => {
          void cases.refetch();
          void documents.refetch();
        }}
      />
    );
  }

  const counts = new Map<string, number>();
  for (const { caseId } of documents.data) {
    if (caseId !== null) counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }

  return (
    <>
      <Stack.Screen options={{ title: t('cases.archive.screenTitle') }} />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={archivedCases(cases.data)}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ArchivedCaseRow item={item} documentCount={counts.get(item.id) ?? 0} />
        )}
        ListEmptyComponent={
          <EmptyState
            title={t('cases.archive.emptyTitle')}
            message={t('cases.archive.emptyMessage')}
          />
        }
        contentContainerStyle={styles.content}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.two,
    padding: Spacing.four,
    ...ContentColumn,
  },
});
