import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useDeferredValue, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { TabScreen } from '@/components/tab-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { activeCases } from '@/features/cases/api';
import { CaseChips } from '@/features/cases/components/case-chips';
import { caseQueries } from '@/features/cases/queries';
import { deadlineQueries } from '@/features/deadlines/queries';
import { useBottomTabInset } from '@/hooks/use-bottom-tab-inset';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { localCalendarDate } from '@/shared/calendar-date';

import { archivedDocuments, isArchived } from '../archive';
import { deadlinesByDocument, selectAttention } from '../attention';
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
 * document, an invitation to scan one (HOME-5). Archived documents and those of archived cases are
 * left out of the list and the filter, and come back in search, marked (HOME-6, CASE-6).
 */
export function DocumentListScreen() {
  const theme = useTheme();
  const { t } = useTranslation();
  const bottomInset = useBottomTabInset();
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
  const listed = documents.data.filter((document) => !isArchived(document));
  const types = availableTypeFilters(listed);
  // A filter left over from a type that is no longer there filters nothing.
  const activeFilter = typeFilter !== null && types.includes(typeFilter) ? typeFilter : null;
  const nearest = deadlinesByDocument(deadlines.data);
  const shown = filterByType(searching ? (results.data ?? []) : listed, activeFilter);
  // All documents: an archived one still needs attention for its deadlines (HOME-6, CASE-6).
  const attention = searching ? [] : selectAttention(documents.data, deadlines.data, now);
  // A document found in an archived case says so on its card: «Apartment · archived».
  const caseNames = new Map(
    cases.data.map((item) => [
      item.id,
      item.archivedAt ? t('cases.archive.archivedName', { name: item.name }) : item.name,
    ])
  );
  const active = activeCases(cases.data);
  const caseChips = (
    <CaseChips
      cases={active}
      counts={countByCase(documents.data)}
      archivedCases={cases.data.length - active.length}
      archivedDocuments={archivedDocuments(documents.data).length}
    />
  );

  if (documents.data.length === 0) {
    return (
      <TabScreen>
        {/* Cases left without documents stay in reach. */}
        {cases.data.length > 0 && <View style={styles.top}>{caseChips}</View>}
        <EmptyDocuments />
      </TabScreen>
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
  } else if (listed.length === 0) {
    empty = (
      <EmptyState
        title={t('documents.allArchivedTitle')}
        message={t('documents.allArchivedMessage')}
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
    <TabScreen>
      {/* Outside the list, so the search stays in reach however far it is scrolled. */}
      <View style={styles.top}>
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
            archiveNote={item.archivedAt === null ? undefined : t('documents.archive.mark')}
          />
        )}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <AttentionBlock items={attention} today={today} />
            {!searching && caseChips}
            <ThemedText type="label" role="heading" themeColor="textSecondary">
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
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset }]}
      />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  top: {
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  listHeader: {
    gap: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.one,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  searching: {
    padding: Spacing.four,
  },
});
