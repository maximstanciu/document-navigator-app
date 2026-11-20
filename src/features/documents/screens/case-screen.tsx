import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { NameForm } from '@/components/ui/name-form';
import { ContentColumn, Radius, Spacing } from '@/constants/theme';
import { CaseActionsButton, CaseActionsSheet } from '@/features/cases/components/case-actions';
import {
  caseQueries,
  useDeleteCase,
  useRenameCase,
  useSetCaseArchived,
} from '@/features/cases/queries';
import { MAX_CASE_NAME_LENGTH } from '@/features/cases/types';
import { deadlineQueries } from '@/features/deadlines/queries';
import { useNow } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { localCalendarDate } from '@/shared/calendar-date';

import { deadlinesByDocument, selectAttention } from '../attention';
import { AttentionBlock } from '../components/attention-block';
import { DocumentListItem } from '../components/document-list-item';
import { documentQueries } from '../queries';

// Opened by a direct URL (web preview), the screen has nothing to go back to.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/** «This case is archived» with «Restore from archive», under the case's name (CASE-6). */
function ArchivedNotice({ busy, onRestore }: { busy: boolean; onRestore: () => void }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <ThemedView type="backgroundElement" style={styles.notice}>
      <View style={styles.noticeTitle}>
        <SymbolView
          name={{ ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' }}
          size={20}
          tintColor={theme.text}
        />
        <ThemedText type="smallBold" role="heading" style={styles.noticeText}>
          {t('cases.archive.archived')}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {t('cases.archive.archivedHint')}
      </ThemedText>
      <Button
        label={t('cases.archive.restore')}
        variant="secondary"
        disabled={busy}
        onPress={onRestore}
      />
    </ThemedView>
  );
}

/**
 * A case (CASE-3…CASE-6): what in its documents needs attention by the rule of HOME-1, then its
 * documents newest first. «Add document» captures a new one into the case, «Choose from documents»
 * files ones already in the app; «⋯» in the header renames, archives or deletes the case. An
 * archived case says so and takes no documents until it is restored.
 */
export function CaseScreen({ id }: { id: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const now = useNow();
  const found = useQuery(caseQueries.detail(id));
  const documents = useQuery(documentQueries.list());
  const deadlines = useQuery(deadlineQueries.open());
  const rename = useRenameCase();
  const remove = useDeleteCase();
  const archive = useSetCaseArchived();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);

  if (found.isPending || documents.isPending || deadlines.isPending) {
    return <LoadingState label={t('cases.loadingOne')} />;
  }
  // Gone from the database, the case would read «not found» while the screen slides away.
  if (remove.isPending || remove.isSuccess) return <LoadingState />;
  if (found.isError || documents.isError || deadlines.isError) {
    return (
      <ErrorState
        error={found.error ?? documents.error ?? deadlines.error}
        onRetry={() => {
          void found.refetch();
          void documents.refetch();
          void deadlines.refetch();
        }}
      />
    );
  }
  if (!found.data) {
    return (
      <>
        <Stack.Screen options={{ title: '', headerRight: undefined }} />
        <EmptyState title={t('cases.notFoundTitle')} message={t('cases.notFoundMessage')} />
      </>
    );
  }

  const { name } = found.data;
  const archived = found.data.archivedAt !== null;
  const today = localCalendarDate(now);
  const inCase = documents.data.filter((document) => document.caseId === id);
  // Documents of archived cases aren't offered to another case (CASE-4, CASE-6).
  const hasOthers = documents.data.some(
    (document) => document.caseId !== id && !document.caseArchived
  );
  const nearest = deadlinesByDocument(deadlines.data);
  const attention = selectAttention(inCase, deadlines.data, now);
  const inCaseIds = new Set(inCase.map((document) => document.id));
  const openDeadlines = deadlines.data.filter((deadline) =>
    inCaseIds.has(deadline.documentId)
  ).length;
  const setArchived = (value: boolean) => archive.mutate({ id, archived: value });
  let failure: string | null = null;
  if (rename.isError) failure = t('cases.actions.renameFailed');
  else if (remove.isError) failure = t('cases.actions.deleteFailed');
  else if (archive.isError) {
    failure = archive.variables.archived
      ? t('cases.actions.archiveFailed')
      : t('cases.archive.restoreFailed');
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: name,
          headerRight: () => <CaseActionsButton onPress={() => setActionsOpen(true)} />,
        }}
      />
      <CaseActionsSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        name={name}
        archived={archived}
        openDeadlines={openDeadlines}
        onRename={() => {
          rename.reset();
          setRenaming(true);
        }}
        onArchive={() => setArchived(true)}
        onRestore={() => setArchived(false)}
        onDelete={() => remove.mutate(id, { onSuccess: leave })}
      />
      <FlatList
        style={{ backgroundColor: theme.background }}
        contentInsetAdjustmentBehavior="automatic"
        data={inCase}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DocumentListItem
            document={item}
            nearestDeadline={nearest.get(item.id)?.[0]}
            today={today}
          />
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            {renaming ? (
              <NameForm
                name={name}
                label={t('cases.nameLabel')}
                maxLength={MAX_CASE_NAME_LENGTH}
                busy={rename.isPending}
                onSave={(newName) =>
                  rename.mutate({ id, name: newName }, { onSuccess: () => setRenaming(false) })
                }
                onCancel={() => setRenaming(false)}
              />
            ) : (
              <ThemedText type="subtitle" role="heading">
                {name}
              </ThemedText>
            )}
            {failure && (
              <ThemedText type="small" role="alert">
                {failure}
              </ThemedText>
            )}
            {archived ? (
              <ArchivedNotice busy={archive.isPending} onRestore={() => setArchived(false)} />
            ) : (
              <View style={styles.buttons}>
                <Button
                  label={t('cases.addDocument')}
                  onPress={() => router.push({ pathname: '/capture', params: { caseId: id } })}
                />
                {hasOthers && (
                  <Button
                    label={t('cases.addExisting')}
                    variant="secondary"
                    onPress={() => router.push({ pathname: '/cases/[id]/add', params: { id } })}
                  />
                )}
              </View>
            )}
            <AttentionBlock items={attention} today={today} />
            {inCase.length > 0 && (
              <ThemedText type="smallBold" role="heading">
                {t('cases.documentsInCase', { count: inCase.length })}
              </ThemedText>
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState title={t('cases.emptyTitle')} message={t('cases.emptyMessage')} />
        }
        keyboardShouldPersistTaps="handled"
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
  header: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  notice: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  noticeTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  noticeText: {
    flexShrink: 1,
  },
});
