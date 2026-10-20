import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SectionList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { BottomTabInset, MaxContentWidth, Spacing, TopTabInset } from '@/constants/theme';
import { useNow } from '@/hooks/use-now';
import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { localCalendarDate } from '@/shared/calendar-date';

import { TimelineItem } from '../components/timeline-item';
import {
  deadlineQueries,
  useDismissDeadline,
  useRestoreDeadline,
  useSetActionDone,
  useSetDeadlineDone,
} from '../queries';
import { groupTimeline } from '../timeline';

/** Each deadline's actions, in the order the analysis listed them. */
function byDeadline(actions: readonly ActionRecord[]) {
  const map = new Map<string, ActionRecord[]>();
  for (const action of actions) {
    if (action.deadlineId === null) continue;
    const list = map.get(action.deadlineId);
    if (list) list.push(action);
    else map.set(action.deadlineId, [action]);
  }
  return map;
}

/** The offer to take back the last change that took a deadline off the tab. */
type Undo = { message: string; label: string; run: () => void };

/**
 * The Deadlines tab (REM-1): open deadlines of all documents, soonest first, in «Overdue», «This
 * week» and «Later». «Done» (US-9) and «Not relevant» (US-12) take a deadline off the tab and cancel
 * its reminders, with «Undo» until the next change or until the person leaves the tab.
 */
export function DeadlinesScreen() {
  const { t } = useTranslation();
  const now = useNow();
  const deadlines = useQuery(deadlineQueries.open());
  const actions = useQuery(deadlineQueries.datedActions());
  const titles = useQuery(deadlineQueries.documentTitles());
  const setDeadlineDone = useSetDeadlineDone();
  const setActionDone = useSetActionDone();
  const dismiss = useDismissDeadline();
  const restore = useRestoreDeadline();
  const [undo, setUndo] = useState<Undo | null>(null);
  const [failed, setFailed] = useState(false);

  // Cleanup runs when the tab loses focus: the offer belongs to what was just done here. The hook
  // re-runs the effect, cleanup first, whenever the callback changes, so it must stay the same.
  useFocusEffect(useCallback(() => () => setUndo(null), []));

  const queries = [deadlines, actions, titles];
  if (deadlines.isPending || actions.isPending || titles.isPending) {
    return <LoadingState label={t('deadlines.loading')} />;
  }
  if (deadlines.isError || actions.isError || titles.isError) {
    return (
      <ErrorState
        error={deadlines.error ?? actions.error ?? titles.error}
        onRetry={() => queries.forEach((query) => void query.refetch())}
      />
    );
  }

  const busy =
    setDeadlineDone.isPending || setActionDone.isPending || dismiss.isPending || restore.isPending;
  const today = localCalendarDate(now);
  const actionsByDeadline = byDeadline(actions.data);
  const sections = groupTimeline(deadlines.data, today).map((group) => ({
    key: group.key,
    title: t(`deadlines.group.${group.key}`),
    data: group.deadlines,
  }));

  /** Each change replaces the offer to undo the one before it; a failure says so. */
  function callbacks(next: Undo | null) {
    setUndo(null);
    setFailed(false);
    return {
      onSuccess: () => setUndo(next),
      onError: () => setFailed(true),
    };
  }

  function undoOffer(description: string, message: string, run: () => void): Undo {
    return { message, label: t('deadlines.undo.label', { description }), run };
  }

  function markDeadlineDone(deadline: DeadlineRecord) {
    const offer = undoOffer(
      deadline.description,
      t('deadlines.undo.done', { description: deadline.description }),
      () => setDeadlineDone.mutate({ id: deadline.id, done: false }, callbacks(null))
    );
    setDeadlineDone.mutate({ id: deadline.id, done: true }, callbacks(offer));
  }

  function markActionDone(deadline: DeadlineRecord, action: ActionRecord, done: boolean) {
    const siblings = actionsByDeadline.get(deadline.id) ?? [];
    // The last open action closes the deadline (REM-9), and it leaves the tab.
    const closes = done && siblings.every((other) => other.id === action.id || other.done);
    // The offer names the action just ticked: the card shows it, maybe not the deadline's own text.
    const offer = closes
      ? undoOffer(
          action.description,
          t('deadlines.undo.done', { description: action.description }),
          () => setActionDone.mutate({ id: action.id, done: false }, callbacks(null))
        )
      : null;
    setActionDone.mutate({ id: action.id, done }, callbacks(offer));
  }

  function markNotRelevant(deadline: DeadlineRecord) {
    const offer = undoOffer(
      deadline.description,
      t('deadlines.undo.dismissed', { description: deadline.description }),
      () => restore.mutate(deadline.id, callbacks(null))
    );
    dismiss.mutate(deadline.id, callbacks(offer));
  }

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {/* Outside the list, so the offer to undo stays in sight however far it is scrolled. */}
        <View style={styles.top}>
          <ThemedText type="subtitle" role="heading" style={styles.heading}>
            {t('deadlines.title')}
          </ThemedText>
          {undo && (
            <ThemedView type="backgroundSelected" style={styles.undo}>
              <ThemedText type="small" role="alert" style={styles.undoMessage}>
                {undo.message}
              </ThemedText>
              <Button
                label={t('deadlines.undo.action')}
                aria-label={undo.label}
                variant="plain"
                disabled={busy}
                onPress={undo.run}
              />
            </ThemedView>
          )}
          {failed && (
            <ThemedText type="small" role="alert">
              {t('deadlines.changeFailed')}
            </ThemedText>
          )}
        </View>
        <SectionList
          sections={sections}
          keyExtractor={(deadline) => deadline.id}
          renderSectionHeader={({ section }) => (
            <ThemedText type="smallBold" role="heading" style={styles.sectionHeader}>
              {section.title}
            </ThemedText>
          )}
          renderItem={({ item }) => (
            <TimelineItem
              deadline={item}
              actions={actionsByDeadline.get(item.id) ?? []}
              documentTitle={titles.data.get(item.documentId)?.trim() || t('documents.untitled')}
              today={today}
              busy={busy}
              onDeadlineDone={() => markDeadlineDone(item)}
              onActionDone={(action, done) => markActionDone(item, action, done)}
              onDismiss={() => markNotRelevant(item)}
            />
          )}
          ListEmptyComponent={
            <EmptyState title={t('deadlines.emptyTitle')} message={t('deadlines.emptyMessage')} />
          }
          stickySectionHeadersEnabled={false}
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
    paddingTop: TopTabInset + Spacing.three,
  },
  undo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    borderRadius: Spacing.three,
  },
  undoMessage: {
    flex: 1,
    paddingVertical: Spacing.two,
  },
  sectionHeader: {
    paddingTop: Spacing.two,
  },
  content: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: BottomTabInset + Spacing.three,
  },
});
