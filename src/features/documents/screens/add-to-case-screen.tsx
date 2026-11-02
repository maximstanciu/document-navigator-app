import { useQuery } from '@tanstack/react-query';
import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, MinTouchTarget, Spacing } from '@/constants/theme';
import { caseQueries, useMoveToCase } from '@/features/cases/queries';
import { useTheme } from '@/hooks/use-theme';
import { formatTimestampDate } from '@/lib/i18n/format';

import { displayTitle } from '../format';
import { documentQueries } from '../queries';
import type { DocumentSummary } from '../types';

// Opened by a direct URL (web preview), the screen has nothing to go back to.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

function DocumentChoice({
  document,
  otherCase,
  selected,
  onToggle,
}: {
  document: DocumentSummary;
  /** The name of the case the document is in now, if another. */
  otherCase: string | undefined;
  selected: boolean;
  onToggle: () => void;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const title = displayTitle(document.title, t);
  const detail = otherCase
    ? t('cases.add.inOtherCase', { name: otherCase })
    : formatTimestampDate(document.createdAt, i18n.language);

  return (
    <Pressable
      role="checkbox"
      aria-checked={selected}
      aria-label={`${title}, ${detail}`}
      onPress={onToggle}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}>
      {/* The mark, not only its color, tells a chosen document. */}
      <SymbolView
        name={
          selected
            ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' }
            : {
                ios: 'square',
                android: 'check_box_outline_blank',
                web: 'check_box_outline_blank',
              }
        }
        size={24}
        tintColor={selected ? theme.tint : theme.textSecondary}
      />
      <View style={styles.choiceText}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {detail}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/**
 * «Choose from documents» (CASE-4), a modal: the documents outside the case, newest first, to tick
 * and file in it at once. One from another case moves here: a document is in one case at most.
 */
export function AddToCaseScreen({ caseId }: { caseId: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const cases = useQuery(caseQueries.list());
  const documents = useQuery(documentQueries.list());
  const move = useMoveToCase();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  if (cases.isPending || documents.isPending) return <LoadingState label={t('cases.loadingOne')} />;
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

  const names = new Map(cases.data.map((item) => [item.id, item.name]));
  const target = names.get(caseId);
  if (target === undefined) {
    return (
      <>
        <Stack.Screen options={{ title: t('cases.add.title') }} />
        <EmptyState title={t('cases.notFoundTitle')} message={t('cases.notFoundMessage')} />
      </>
    );
  }

  const candidates = documents.data.filter((document) => document.caseId !== caseId);
  // A document deleted meanwhile drops out of the choice.
  const chosen = candidates.filter((document) => selected.has(document.id)).map(({ id }) => id);
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('cases.add.title') }} />
      <FlatList
        data={candidates}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <DocumentChoice
            document={item}
            otherCase={item.caseId === null ? undefined : names.get(item.caseId)}
            selected={selected.has(item.id)}
            onToggle={() => toggle(item.id)}
          />
        )}
        ListHeaderComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.hint}>
            {t('cases.add.hint', { name: target })}
          </ThemedText>
        }
        ListEmptyComponent={<EmptyState title={t('cases.add.allInCase')} />}
        contentContainerStyle={styles.content}
      />
      <View
        style={[
          styles.footer,
          { borderColor: theme.border, paddingBottom: Math.max(insets.bottom, Spacing.three) },
        ]}>
        {move.isError && (
          <ThemedText type="small" role="alert">
            {t('cases.add.failed')}
          </ThemedText>
        )}
        <Button
          label={
            chosen.length > 0
              ? t('cases.add.submit', { count: chosen.length })
              : t('cases.add.submitNone')
          }
          disabled={chosen.length === 0 || move.isPending}
          onPress={() => move.mutate({ documentIds: chosen, caseId }, { onSuccess: leave })}
        />
        <Button label={t('common.cancel')} variant="secondary" onPress={leave} />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
  hint: {
    paddingBottom: Spacing.two,
  },
  choice: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  choiceText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
