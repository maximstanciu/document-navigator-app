import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnalysisResult } from '@/shared/analysis/schema';

import { documentQueries } from '../queries';
import { arrangeResult, sortRisks } from '../result-layout';
import { DeadlineCard, DismissedDeadline, UndatedActions } from './deadline-card';
import { DetailSection } from './detail-section';
import { FraudWarning } from './fraud-warning';
import { InlineError } from './inline-error';
import { KeyFactRow } from './key-fact-row';
import { QualityNotice } from './quality-notice';
import { RiskItem } from './risk-item';

/** «What to do» and «Deadlines» (DET-3, DET-4): each deadline in exactly one of them. */
function TasksBlocks({
  documentId,
  documentTitle,
  readable,
}: {
  documentId: string;
  documentTitle: string;
  readable: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const deadlines = useQuery(documentQueries.deadlines(documentId));
  const actions = useQuery(documentQueries.actions(documentId));

  if (deadlines.isPending || actions.isPending) {
    return <ActivityIndicator color={theme.textSecondary} aria-label={t('common.loading')} />;
  }
  if (deadlines.error || actions.error) {
    return (
      <InlineError
        onRetry={() => {
          if (deadlines.error) deadlines.refetch();
          if (actions.error) actions.refetch();
        }}
      />
    );
  }

  const layout = arrangeResult(deadlines.data, actions.data);
  const hasActions = layout.actionGroups.length > 0 || layout.dismissedActionGroups.length > 0;
  const hasDeadlines = layout.deadlines.length > 0 || layout.dismissedDeadlines.length > 0;

  return (
    <>
      {(hasActions || readable) && (
        <DetailSection title={t('documents.section.actions')}>
          {!hasActions && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('documents.noActions')}
            </ThemedText>
          )}
          {layout.actionGroups.map((group) =>
            group.deadline ? (
              <DeadlineCard
                key={group.deadline.id}
                deadline={group.deadline}
                actions={group.actions}
                documentTitle={documentTitle}
              />
            ) : (
              <UndatedActions key="undated" actions={group.actions} />
            )
          )}
          {layout.dismissedActionGroups.map(
            (group) =>
              group.deadline && (
                <DismissedDeadline key={group.deadline.id} deadline={group.deadline} />
              )
          )}
        </DetailSection>
      )}
      {hasDeadlines && (
        <DetailSection title={t('documents.section.deadlines')}>
          {layout.deadlines.map((deadline) => (
            <DeadlineCard key={deadline.id} deadline={deadline} documentTitle={documentTitle} />
          ))}
          {layout.dismissedDeadlines.map((deadline) => (
            <DismissedDeadline key={deadline.id} deadline={deadline} />
          ))}
        </DetailSection>
      )}
    </>
  );
}

/**
 * The analysis of a document in the order of the four questions (SPEC §1.4, §4.4): fraud signs
 * first (DET-10), then «In short», what to do and by when, risks and key facts.
 */
export function DocumentResult({
  documentId,
  documentTitle,
  analysis,
}: {
  documentId: string;
  /** As the screen shows it, for the calendar events of its deadlines (REM-10). */
  documentTitle: string;
  analysis: AnalysisResult;
}) {
  const { t } = useTranslation();
  const { readable } = analysis.quality;

  return (
    <View style={styles.blocks}>
      {analysis.fraudSignals.length > 0 && <FraudWarning signals={analysis.fraudSignals} />}
      {!readable && <QualityNotice issues={analysis.quality.issues} />}
      {analysis.summary.trim() !== '' && (
        <DetailSection title={t('documents.section.summary')}>
          <ThemedText>{analysis.summary}</ThemedText>
        </DetailSection>
      )}
      <TasksBlocks documentId={documentId} documentTitle={documentTitle} readable={readable} />
      {analysis.risks.length > 0 && (
        <DetailSection title={t('documents.section.risks')}>
          {sortRisks(analysis.risks).map((risk, index) => (
            <RiskItem key={index} risk={risk} />
          ))}
        </DetailSection>
      )}
      {analysis.keyFacts.length > 0 && (
        <DetailSection title={t('documents.section.keyFacts')}>
          {analysis.keyFacts.map((fact, index) => (
            <KeyFactRow key={index} fact={fact} />
          ))}
        </DetailSection>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  blocks: {
    gap: Spacing.four,
  },
});
