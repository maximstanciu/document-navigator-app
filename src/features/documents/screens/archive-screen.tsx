import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ContentColumn, Spacing } from '@/constants/theme';
import { archivedCases } from '@/features/cases/api';
import { ArchivedCaseRow } from '@/features/cases/components/archived-case-row';
import { caseQueries } from '@/features/cases/queries';
import type { CaseSummary } from '@/features/cases/types';
import { deadlineQueries } from '@/features/deadlines/queries';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { formatTimestampDate } from '@/lib/i18n/format';
import { localCalendarDate } from '@/shared/calendar-date';

import { archivedDocuments } from '../archive';
import { deadlinesByDocument } from '../attention';
import { DocumentListItem } from '../components/document-list-item';
import { documentQueries } from '../queries';
import type { DocumentSummary } from '../types';

type Row = { kind: 'case'; item: CaseSummary } | { kind: 'document'; item: DocumentSummary };
type Section = { key: string; title: string; data: Row[] };

/**
 * The archive (CASE-6, HOME-6), opened from «Archive» in the cases block: archived cases, then
 * archived documents, the most recently archived first in each. A case shows its number of
 * documents, a document its card as in the list (HOME-2) with since when it is archived; each opens
 * its own screen, where it can be restored.
 */
export function ArchiveScreen() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const now = useNow();
  const cases = useQuery(caseQueries.list());
  const documents = useQuery(documentQueries.list());
  const deadlines = useQuery(deadlineQueries.open());

  if (cases.isPending || documents.isPending || deadlines.isPending) {
    return <LoadingState label={t('archive.loading')} />;
  }
  if (cases.isError || documents.isError || deadlines.isError) {
    return (
      <ErrorState
        error={cases.error ?? documents.error ?? deadlines.error}
        onRetry={() => {
          void cases.refetch();
          void documents.refetch();
          void deadlines.refetch();
        }}
      />
    );
  }

  const counts = new Map<string, number>();
  for (const { caseId } of documents.data) {
    if (caseId !== null) counts.set(caseId, (counts.get(caseId) ?? 0) + 1);
  }
  // A document's case is named on its card, «· archived» when the case is too.
  const caseNames = new Map(
    cases.data.map((item) => [
      item.id,
      item.archivedAt ? t('cases.archive.archivedName', { name: item.name }) : item.name,
    ])
  );
  const nearest = deadlinesByDocument(deadlines.data);
  const today = localCalendarDate(now);

  const sections: Section[] = [
    {
      key: 'cases',
      title: t('cases.title'),
      data: archivedCases(cases.data).map((item): Row => ({ kind: 'case', item })),
    },
    {
      key: 'documents',
      title: t('archive.documents'),
      data: archivedDocuments(documents.data).map((item): Row => ({ kind: 'document', item })),
    },
  ].filter((section) => section.data.length > 0);

  return (
    <>
      <Stack.Screen options={{ title: t('archive.screenTitle') }} />
      <SectionList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        sections={sections}
        keyExtractor={(row) => `${row.kind}:${row.item.id}`}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <ThemedText
            type="label"
            role="heading"
            themeColor="textSecondary"
            style={styles.sectionTitle}>
            {section.title}
          </ThemedText>
        )}
        renderItem={({ item: row }) =>
          row.kind === 'case' ? (
            <ArchivedCaseRow item={row.item} documentCount={counts.get(row.item.id) ?? 0} />
          ) : (
            <DocumentListItem
              document={row.item}
              nearestDeadline={nearest.get(row.item.id)?.[0]}
              today={today}
              caseName={row.item.caseId === null ? undefined : caseNames.get(row.item.caseId)}
              archiveNote={
                row.item.archivedAt
                  ? t('archive.since', {
                      date: formatTimestampDate(row.item.archivedAt, i18n.language),
                    })
                  : undefined
              }
            />
          )
        }
        ListEmptyComponent={
          <EmptyState title={t('archive.emptyTitle')} message={t('archive.emptyMessage')} />
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
  sectionTitle: {
    paddingTop: Spacing.two,
  },
});
