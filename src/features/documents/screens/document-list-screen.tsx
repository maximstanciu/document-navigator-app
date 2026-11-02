import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { CaseChips } from '@/features/cases/components/case-chips';
import { caseQueries } from '@/features/cases/queries';
import { deadlineQueries } from '@/features/deadlines/queries';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { localCalendarDate } from '@/shared/calendar-date';

import { deadlinesByDocument, selectAttention } from '../attention';
import { AddDocumentButton } from '../components/add-document-button';
import { AttentionBlock } from '../components/attention-block';
import { DocumentListItem } from '../components/document-list-item';
import { EmptyDocuments } from '../components/empty-documents';
import { SearchField } from '../components/search-field';
import { TypeFilterBar } from '../components/type-filter-bar';
import { documentQueries } from '../queries';
import { availableTypeFilters, filterByType, type TypeFilter } from '../type-filter';
import type { DocumentSummary } from '../types';

/** How many documents each case has, by its id (CASE-3). */
function countByCase(documents: readonly DocumentSummary[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { caseId } of documents) {
    if (caseId !== null) counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }
  return counts;
}

/**
 * The documents tab (SPEC §4.5): «Needs attention» (HOME-1), the cases (CASE-3), then all documents
 * newest first (HOME-2), with search (HOME-3) and a filter by type (HOME-4); before the first
 * document, an invitation to scan one (HOME-5).
 */
export function DocumentListScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const now = useNow();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter | null>(null);
  // Typing stays responsive while the search for the previous letters is still rendering.
  const search = useDeferredValue(query.trim());
  const searching = search !== '';

  const documents = useQuery(documentQueries.list());
  const deadlines = useQuery(deadlineQueries.open());
  const cases = useQuery(caseQueries.list());
  const results = useQuery({
    ...documentQueries.search(search),
    enabled: searching,
    // The previous results stay until the next ones arrive, instead of a spinner per letter.
    placeholderData: keepPreviousData,
  });

  if (documents.isPending || deadlines.isPending || cases.isPending) {
    return <LoadingState label={t('documents.loadingList')} />;
  }
  if (documents.isError || deadlines.isError || cases.isError) {
    return (
      <ErrorState
        error={documents.error ?? deadlines.error ?? cases.error}
        onRetry={() => {
          void documents.refetch();
          void deadlines.refetch();
          void cases.refetch();
        }}
      />
    );
  }

  const today = localCalendarDate(now);
  const types = availableTypeFilters(documents.data);
  // A filter left over from a type that is no longer there filters nothing.
  const activeFilter = typeFilter !== null && types.includes(typeFilter) ? typeFilter : null;
  const nearest = deadlinesByDocument(deadlines.data);
  const shown = filterByType(searching ? (results.data ?? []) : documents.data, activeFilter);
  const attention = searching ? [] : selectAttention(documents.data, deadlines.data, now);
  const caseNames = new Map(cases.data.map((item) => [item.id, item.name]));
  const caseChips = <CaseChips cases={cases.data} counts={countByCase(documents.data)} />;

  const header = (
    <View style={styles.heading}>
      <ThemedText type="subtitle" role="heading" style={styles.title}>
        {t('documents.title')}
      </ThemedText>
      <AddDocumentButton />
    </View>
  );

  if (documents.data.length === 0) {
    return (
      <ThemedView style={styles.container}>
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
          <View style={styles.top}>
            {header}
            {/* Cases left without documents stay in reach. */}
            {cases.data.length > 0 && caseChips}
          </View>
          <EmptyDocuments />
        </SafeAreaView>
      </ThemedView>
    );
  }

  let empty;
  if (searching && results.isPending) {
    empty = (
      <ActivityIndicator
        color={theme.textSecondary}
        aria-label={t('documents.search.loading')}
        style={styles.searching}
      />
    );
  } else if (searching && results.error) {
    empty = <ErrorState error={results.error} onRetry={() => results.refetch()} />;
  } else if (searching) {
    empty = (
      <EmptyState
        title={t('documents.search.noResultsTitle')}
        message={t('documents.search.noResultsMessage')}
      />
    );
  } else {
    empty = (
      <EmptyState
        title={t('documents.filter.noMatchTitle')}
        message={t('documents.filter.noMatchMessage')}
      />
    );
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Outside the list, so «Add» and the search stay in reach however far it is scrolled. */}
        <View style={styles.top}>
          {header}
          <SearchField value={query} onChangeText={setQuery} />
        </View>
        <FlatList
          data={shown}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DocumentListItem
              document={item}
              nearestDeadline={nearest.get(item.id)?.[0]}
              today={today}
              caseName={item.caseId === null ? undefined : caseNames.get(item.caseId)}
            />
          )}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <AttentionBlock items={attention} today={today} />
              {!searching && caseChips}
              <ThemedText type="smallBold" role="heading">
                {searching ? t('documents.search.results') : t('documents.allDocuments')}
              </ThemedText>
              {types.length > 1 && (
                <TypeFilterBar types={types} selected={activeFilter} onSelect={setTypeFilter} />
              )}
            </View>
          }
          ListEmptyComponent={empty}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
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
  top: {
    gap: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  heading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingTop: TopTabInset + Spacing.three,
  },
  title: {
    flexShrink: 1,
  },
  listHeader: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
  searching: {
    padding: Spacing.four,
  },
});
