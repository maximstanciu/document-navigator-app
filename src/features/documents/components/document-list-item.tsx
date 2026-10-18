import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate } from '@/lib/i18n/format';

import { displayTitle, formatDocumentType, formatMeta } from '../format';
import type { DeadlineSummary, DocumentSummary } from '../types';

type DocumentListItemProps = {
  document: DocumentSummary;
  /** Its nearest open deadline, if it has one. */
  nearestDeadline?: DeadlineSummary;
  /** The device's calendar date, to tell an overdue deadline. */
  today: string;
};

/** A document in the list (HOME-2): title, type, sender, nearest deadline and analysis status. */
export function DocumentListItem({ document, nearestDeadline, today }: DocumentListItemProps) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const title = displayTitle(document.title, t);
  const from = [formatDocumentType(document.documentType, t), document.senderName]
    .filter(Boolean)
    .join(' · ');
  let dueLine: string | null = null;
  const overdue = nearestDeadline !== undefined && nearestDeadline.dueDate < today;
  if (nearestDeadline) {
    const date = formatCalendarDate(nearestDeadline.dueDate, i18n.language);
    const due = nearestDeadline.dueTime
      ? t('documents.deadline.dueAt', { date, time: nearestDeadline.dueTime })
      : t('documents.deadline.due', { date });
    dueLine = overdue ? `${due} · ${t('documents.deadline.overdue')}` : due;
  }
  const meta = formatMeta(document, t, i18n.language);

  return (
    <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
      <Pressable role="link" aria-label={[title, from, dueLine, meta].filter(Boolean).join(', ')}>
        {({ pressed }) => (
          <ThemedView
            type={pressed ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.row}>
            <ThemedText type="smallBold" numberOfLines={2}>
              {title}
            </ThemedText>
            {from !== '' && (
              <ThemedText type="small" numberOfLines={1}>
                {from}
              </ThemedText>
            )}
            {dueLine && (
              <ThemedText type="smallBold" style={overdue && { color: theme.riskHigh }}>
                {dueLine}
              </ThemedText>
            )}
            <ThemedText type="small" themeColor="textSecondary">
              {meta}
            </ThemedText>
          </ThemedView>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
