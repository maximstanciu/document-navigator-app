import { useQuery } from '@tanstack/react-query';
import type { TFunction } from 'i18next';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, type ScrollViewInstance } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { AnalysisStatusPanel } from '@/features/analysis/components/analysis-status-panel';
import { useAnalyzeDocument } from '@/features/analysis/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate, formatTimestampDate } from '@/lib/i18n/format';

import { DocumentActionsButton, DocumentActionsSheet } from '../components/document-actions';
import { DocumentResult } from '../components/document-result';
import { OriginalBlock } from '../components/original-block';
import { RenameForm } from '../components/rename-form';
import { displayTitle, formatDocumentType } from '../format';
import { documentQueries, useDeleteDocument, useRenameDocument } from '../queries';
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

// Opened by a direct URL (web preview or a notification), the screen has nothing to go back to.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * A document (SPEC §4.4): the title, where its analysis stands, the analysis itself in the order of
 * the four questions (DET-1…DET-10), the original and the disclaimer. «⋯» in the header renames,
 * analyzes again or deletes it (DET-9).
 */
export function DocumentDetailScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { data, error, isPending, refetch } = useQuery(documentQueries.detail(id));
  // The same query as the «Original» block: no second read.
  const pages = useQuery(documentQueries.pages(id));
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const scroll = useRef<ScrollViewInstance>(null);
  const rename = useRenameDocument();
  const remove = useDeleteDocument();
  const analyze = useAnalyzeDocument();

  if (isPending) return <LoadingState label={t('documents.loadingOne')} />;
  // Gone from the database, the document would read «not found» while the screen slides away.
  if (remove.isPending || remove.isSuccess) return <LoadingState />;
  if (error) return <ErrorState error={error} onRetry={() => refetch()} />;
  if (!data) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerRight: undefined }} />
        <EmptyState title={t('documents.notFoundTitle')} message={t('documents.notFoundMessage')} />
      </>
    );
  }

  const title = displayTitle(data.title, t);
  const meta = documentMeta(data, t, i18n.language);

  // Without its page files a new analysis can only fail, and the document would read as failed
  // although its analysis is fine (STO-8).
  const hasAllPages =
    pages.data !== undefined &&
    pages.data.length > 0 &&
    pages.data.every((page) => page.uri !== null);
  const reanalyze = () => {
    analyze.mutate(id);
    // The progress shows at the top.
    scroll.current?.scrollTo({ y: 0, animated: true });
  };
  const startRenaming = () => {
    rename.reset();
    setRenaming(true);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  return (
    <ScrollView
      ref={scroll}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      // With the keyboard up for «Rename», the first tap on «Save» saves instead of closing it.
      keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title,
          headerRight: () => <DocumentActionsButton onPress={() => setActionsOpen(true)} />,
        }}
      />
      <DocumentActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        title={title}
        canReanalyze={data.status === 'ready' && hasAllPages}
        onRename={startRenaming}
        onReanalyze={reanalyze}
        onDelete={() => remove.mutate(id, { onSuccess: leave })}
      />
      {renaming ? (
        <RenameForm
          title={data.title}
          onSave={(newTitle) =>
            rename.mutate({ id, title: newTitle }, { onSuccess: () => setRenaming(false) })
          }
          onCancel={() => setRenaming(false)}
        />
      ) : (
        <ThemedText type="subtitle" role="heading">
          {title}
        </ThemedText>
      )}
      {(rename.isError || remove.isError) && (
        <ThemedText type="small" role="alert">
          {rename.isError ? t('documents.rename.failed') : t('documents.actions.deleteFailed')}
        </ThemedText>
      )}
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
