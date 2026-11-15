import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { RelatedCaseButton } from '@/features/cases/components/related-case-button';
import { useTheme } from '@/hooks/use-theme';
import { matterNumbersOf } from '@/lib/db/matter-numbers';
import { formatCalendarDate, formatTimestampDate } from '@/lib/i18n/format';
import type { AnalysisResult } from '@/shared/analysis/schema';
import { localCalendarDate } from '@/shared/calendar-date';

import { displayTitle } from '../format';
import { documentQueries, useDismissRelatedDocument } from '../queries';
import { relatedState } from '../related';
import type { RelatedDocument } from '../types';
import { DueLine, dueText } from './attention-block';
import { DetailSection } from './detail-section';
import { InlineError } from './inline-error';

type RelatedRowProps = {
  /** The document whose screen this is, and its case. */
  documentId: string;
  caseId: string | null;
  related: RelatedDocument;
  /** The shared number as this document writes it. */
  number: string;
};

/**
 * A related document (LINK-3): a link to it with its date, the shared number and where it stands —
 * its nearest open deadline, or that everything in it is marked done. Under the link, unless both
 * documents are in one case, the case button and «Not related» (LINK-4).
 */
function RelatedRow({ documentId, caseId, related, number }: RelatedRowProps) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  // The queries its own screen reads: «Done» pressed there shows here without a reload.
  const deadlines = useQuery(documentQueries.deadlines(related.id));
  const actions = useQuery(documentQueries.actions(related.id));
  const dismiss = useDismissRelatedDocument();
  const [moveFailed, setMoveFailed] = useState(false);

  const title = displayTitle(related.title, t);
  const today = localCalendarDate(new Date());
  const date = related.documentDate
    ? formatCalendarDate(related.documentDate, i18n.language)
    : formatTimestampDate(related.createdAt, i18n.language);
  const shared = t('documents.related.sharedNumber', { number });
  const state = deadlines.data && actions.data ? relatedState(deadlines.data, actions.data) : null;

  let stateLabel: string | null = null;
  if (state?.kind === 'deadline') {
    const due = dueText(state.deadline, today, t, i18n.language);
    stateLabel = `${due.when} · ${due.date}, ${state.deadline.description}`;
  } else if (state?.kind === 'allDone') {
    stateLabel = t('documents.related.allDone');
  }
  const inOneCase = caseId !== null && caseId === related.caseId;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {/* `push`: from a document's screen to another document's, with the way back. */}
      <Link href={{ pathname: '/documents/[id]', params: { id: related.id } }} push asChild>
        <Pressable
          role="link"
          aria-label={[title, date, shared, stateLabel].filter(Boolean).join(', ')}>
          {({ pressed }) => (
            <View style={[styles.body, pressed && styles.pressed]}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {`${date} · ${shared}`}
              </ThemedText>
              {state?.kind === 'deadline' && <DueLine deadline={state.deadline} today={today} />}
              {state?.kind === 'allDone' && (
                // In words; the mark only decorates them.
                <View style={styles.done}>
                  <SymbolView
                    name={{
                      ios: 'checkmark.circle.fill',
                      android: 'check_circle',
                      web: 'check_circle',
                    }}
                    size={18}
                    tintColor={theme.text}
                  />
                  <ThemedText type="smallBold">{t('documents.related.allDone')}</ThemedText>
                </View>
              )}
            </View>
          )}
        </Pressable>
      </Link>
      {!inOneCase && (
        <View style={styles.buttons}>
          <RelatedCaseButton
            documentId={documentId}
            caseId={caseId}
            related={{ id: related.id, title, caseId: related.caseId }}
            onFailedChange={setMoveFailed}
          />
          <Button
            label={t('documents.related.notRelated')}
            aria-label={t('documents.related.notRelatedLabel', { title })}
            variant="plain"
            disabled={dismiss.isPending}
            onPress={() => {
              setMoveFailed(false);
              dismiss.mutate({ id: documentId, relatedId: related.id });
            }}
          />
        </View>
      )}
      {(moveFailed || dismiss.isError) && (
        <ThemedText type="small" role="alert">
          {moveFailed ? t('cases.picker.moveFailed') : t('documents.related.notRelatedFailed')}
        </ThemedText>
      )}
    </ThemedView>
  );
}

type RelatedDocumentsProps = {
  documentId: string;
  /** The case the document is filed in, `null` — none. */
  caseId: string | null;
  /** Its analysis: the shared number is shown as this document writes it. */
  analysis: AnalysisResult;
};

/**
 * «Related documents» on the screen of an analyzed document (LINK-3, US-16): the documents that
 * carry one of its contract, invoice or case numbers — an invoice under its reminder, with what was
 * done about it. Nothing at all while there are none.
 */
export function RelatedDocuments({ documentId, caseId, analysis }: RelatedDocumentsProps) {
  const { t } = useTranslation();
  const related = useQuery(documentQueries.related(documentId));

  if (related.isPending) return null;
  if (related.error) {
    return (
      <DetailSection title={t('documents.related.title')}>
        <InlineError onRetry={() => related.refetch()} />
      </DetailSection>
    );
  }
  if (related.data.length === 0) return null;

  const written = new Map(matterNumbersOf(analysis).map(({ value, display }) => [value, display]));

  return (
    <DetailSection title={t('documents.related.title')}>
      {related.data.map((item) => (
        <RelatedRow
          key={item.id}
          documentId={documentId}
          caseId={caseId}
          related={item}
          number={written.get(item.sharedNumber) ?? item.sharedNumber}
        />
      ))}
    </DetailSection>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  body: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  done: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
  },
});
