import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Spacing } from '@/constants/theme';
import {
  useDismissDeadline,
  useRestoreDeadline,
  useSetActionDone,
  useSetDeadlineDone,
} from '@/features/deadlines/queries';
import { useTheme } from '@/hooks/use-theme';
import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { formatCalendarDate } from '@/lib/i18n/format';
import { localCalendarDate } from '@/shared/calendar-date';

import { QuoteDisclosure } from './quote';

function useDueDate(deadline: DeadlineRecord) {
  const { i18n } = useTranslation();
  return formatCalendarDate(deadline.dueDate, i18n.language);
}

/** When it's due, whether that has passed, and how far to trust the date (ANL-6). */
function DeadlineFacts({ deadline }: { deadline: DeadlineRecord }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const date = useDueDate(deadline);
  const overdue = deadline.status === 'open' && deadline.dueDate < localCalendarDate(new Date());
  const computed = deadline.dateSource === 'computed';

  return (
    <View style={styles.facts}>
      <View style={styles.dateLine}>
        <ThemedText type="smallBold">
          {deadline.dueTime
            ? t('documents.deadline.dueAt', { date, time: deadline.dueTime })
            : t('documents.deadline.due', { date })}
        </ThemedText>
        {overdue && (
          <ThemedText type="smallBold" style={{ color: theme.riskHigh }}>
            {t('documents.deadline.overdue')}
          </ThemedText>
        )}
      </View>
      {computed && deadline.computation && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.deadline.computed', { computation: deadline.computation })}
        </ThemedText>
      )}
      {deadline.dateSource === 'user' ? (
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.deadline.changedByYou')}
        </ThemedText>
      ) : (
        (computed || deadline.confidence !== 'high') && (
          <ThemedText type="small" themeColor="textSecondary">
            {t('documents.deadline.checkOriginal')}
          </ThemedText>
        )
      )}
      {deadline.sourceQuote && (
        <QuoteDisclosure quote={deadline.sourceQuote} page={deadline.sourcePage} />
      )}
    </View>
  );
}

type DeadlineCardProps = {
  deadline: DeadlineRecord;
  /** The deadline's actions (DET-3). Without them the deadline itself gets «Done» (REM-9). */
  actions?: readonly ActionRecord[];
};

/**
 * A deadline with the actions due by it, or on its own (DET-3, DET-4): «Done» on each action or on
 * the deadline, and «Not relevant».
 */
export function DeadlineCard({ deadline, actions = [] }: DeadlineCardProps) {
  const { t } = useTranslation();
  const date = useDueDate(deadline);
  const setActionDone = useSetActionDone();
  const setDeadlineDone = useSetDeadlineDone();
  const dismiss = useDismissDeadline();

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {actions.length === 0 && (
        <Checkbox
          label={deadline.description}
          checked={deadline.status === 'done'}
          onChange={(done) => setDeadlineDone.mutate({ id: deadline.id, done })}
        />
      )}
      <DeadlineFacts deadline={deadline} />
      {actions.map((action) => (
        <Checkbox
          key={action.id}
          label={action.description}
          checked={action.done}
          onChange={(done) => setActionDone.mutate({ id: action.id, done })}
        />
      ))}
      <Button
        label={t('documents.deadline.notRelevant')}
        aria-label={t('documents.deadline.notRelevantLabel', { date })}
        variant="plain"
        disabled={dismiss.isPending}
        onPress={() => dismiss.mutate(deadline.id)}
      />
    </ThemedView>
  );
}

/** Actions the document asks for without a date (DET-3). */
export function UndatedActions({ actions }: { actions: readonly ActionRecord[] }) {
  const setActionDone = useSetActionDone();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {actions.map((action) => (
        <Checkbox
          key={action.id}
          label={action.description}
          checked={action.done}
          onChange={(done) => setActionDone.mutate({ id: action.id, done })}
        />
      ))}
    </ThemedView>
  );
}

/** A deadline marked «Not relevant», collapsed to one line with «Restore» (DET-4). */
export function DismissedDeadline({ deadline }: { deadline: DeadlineRecord }) {
  const { t } = useTranslation();
  const date = useDueDate(deadline);
  const restore = useRestoreDeadline();

  return (
    <View style={styles.dismissed}>
      <View style={styles.dismissedText}>
        <ThemedText type="small" themeColor="textSecondary" style={styles.struck}>
          {deadline.description}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {`${t('documents.deadline.due', { date })} · ${t('documents.deadline.notRelevant')}`}
        </ThemedText>
      </View>
      <Button
        label={t('documents.deadline.restore')}
        aria-label={t('documents.deadline.restoreLabel', { date })}
        variant="plain"
        disabled={restore.isPending}
        onPress={() => restore.mutate(deadline.id)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  facts: {
    gap: Spacing.one,
  },
  dateLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.two,
  },
  dismissed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  dismissedText: {
    flex: 1,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
});
