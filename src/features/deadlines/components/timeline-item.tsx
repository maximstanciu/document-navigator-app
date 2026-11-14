import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { formatCalendarDate, formatDateTile } from '@/lib/i18n/format';

import { formatDueIn } from '../format';
import { AddToCalendarButton } from './add-to-calendar-button';

type TimelineItemProps = {
  deadline: DeadlineRecord;
  /** The actions due by it (DET-3). Without them the deadline itself gets «Done» (REM-9). */
  actions: readonly ActionRecord[];
  documentTitle: string;
  /** The device's calendar date. */
  today: string;
  /** A change is being saved: nothing else can change meanwhile. */
  busy: boolean;
  onDeadlineDone: () => void;
  onActionDone: (action: ActionRecord, done: boolean) => void;
  onDismiss: () => void;
};

/**
 * An open deadline on the Deadlines tab (REM-1): how soon and when, «Done» on the deadline or on
 * each of its actions as on the document screen (REM-9, US-9), «Add to calendar» (REM-10), its
 * document, and «Not relevant» (US-12). Overdue is said in words, the color only repeats it.
 */
export function TimelineItem({
  deadline,
  actions,
  documentTitle,
  today,
  busy,
  onDeadlineDone,
  onActionDone,
  onDismiss,
}: TimelineItemProps) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const date = formatCalendarDate(deadline.dueDate, i18n.language);
  const tile = formatDateTile(deadline.dueDate, i18n.language);
  const overdue = deadline.dueDate < today;
  // With actions the deadline gets no checkbox of its own; its description still says what it is,
  // unless its only action says the same.
  const describe =
    actions.length > 1 ||
    (actions.length === 1 && actions[0].description.trim() !== deadline.description.trim());

  return (
    // An overdue card is tinted; it says «overdue» in words as well.
    <ThemedView type={overdue ? 'riskHighBackground' : 'backgroundElement'} style={styles.card}>
      <View style={styles.header}>
        {/* The day and month again, large: the line next to it says the date in full. */}
        <ThemedView type={overdue ? 'background' : 'tint'} style={styles.tile} aria-hidden>
          <ThemedText
            type="subtitle"
            themeColor={overdue ? 'text' : 'onTint'}
            style={styles.tileDay}>
            {tile.day}
          </ThemedText>
          <ThemedText type="label" themeColor={overdue ? 'riskHigh' : 'onTint'}>
            {tile.month}
          </ThemedText>
        </ThemedView>
        <ThemedText type="smallBold" style={styles.when}>
          <ThemedText type="smallBold" style={overdue && { color: theme.riskHigh }}>
            {formatDueIn(deadline.dueDate, today, t)}
          </ThemedText>
          {` · ${deadline.dueTime ? `${date}, ${deadline.dueTime}` : date}`}
        </ThemedText>
      </View>
      {actions.length === 0 ? (
        <Checkbox
          label={deadline.description}
          checked={false}
          disabled={busy}
          onChange={onDeadlineDone}
        />
      ) : (
        <>
          {describe && <ThemedText type="small">{deadline.description}</ThemedText>}
          {actions.map((action) => (
            <Checkbox
              key={action.id}
              label={action.description}
              checked={action.done}
              disabled={busy}
              onChange={(done) => onActionDone(action, done)}
            />
          ))}
        </>
      )}
      <AddToCalendarButton deadline={deadline} actions={actions} documentTitle={documentTitle} />
      <View style={styles.footer}>
        {/* Layout around and inside the link: `Link asChild` does not keep the Pressable's style. */}
        <View style={styles.document}>
          <Link href={{ pathname: '/documents/[id]', params: { id: deadline.documentId } }} asChild>
            <Pressable
              role="link"
              aria-label={t('deadlines.openDocument', { title: documentTitle })}>
              <View style={styles.documentRow}>
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                  style={styles.documentTitle}>
                  {t('deadlines.document', { title: documentTitle })}
                </ThemedText>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  size={16}
                  tintColor={theme.textSecondary}
                />
              </View>
            </Pressable>
          </Link>
        </View>
        <Button
          label={t('documents.deadline.notRelevant')}
          aria-label={t('deadlines.notRelevantLabel', { description: deadline.description })}
          variant="plain"
          disabled={busy}
          onPress={onDismiss}
        />
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.one,
    padding: Spacing.three - Spacing.one,
    borderRadius: Radius.card,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three - Spacing.one,
    paddingBottom: Spacing.one,
  },
  tile: {
    width: 56,
    minHeight: 60,
    borderRadius: Radius.tile + Spacing.half,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.one,
  },
  tileDay: {
    fontSize: 24,
    lineHeight: 26,
    letterSpacing: -0.8,
  },
  when: {
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  document: {
    flex: 1,
  },
  documentRow: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  documentTitle: {
    flexShrink: 1,
  },
});
