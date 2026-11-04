import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { countryName } from '@/lib/i18n/display-names';
import { formatCalendarDate } from '@/lib/i18n/format';

import { displayTitle, formatDocumentType, formatMeta } from '../format';
import type { DeadlineSummary, DocumentSummary } from '../types';

type DocumentListItemProps = {
  document: DocumentSummary;
  /** Its nearest open deadline, if it has one. */
  nearestDeadline?: DeadlineSummary;
  /** The device's calendar date, to tell an overdue deadline. */
  today: string;
  /** The name of the case it is filed in (CASE-3); left out on the case's own screen. */
  caseName?: string;
};

/**
 * A document in the list (HOME-2): title, type, sender, nearest deadline, analysis status, the
 * code of its country (DET-11), and its case (CASE-3).
 */
export function DocumentListItem({
  document,
  nearestDeadline,
  today,
  caseName,
}: DocumentListItemProps) {
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
  // «PT» on the card; a screen reader says the country's name.
  const metaLine = [meta, document.country].filter(Boolean).join(' · ');
  const metaLabel = [meta, document.country && countryName(document.country, t)]
    .filter(Boolean)
    .join(' · ');
  const inCase = caseName ? t('cases.document.inCase', { name: caseName }) : null;

  return (
    <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
      <Pressable
        role="link"
        aria-label={[title, from, dueLine, metaLabel, inCase].filter(Boolean).join(', ')}>
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
              {metaLine}
            </ThemedText>
            {caseName && (
              <View style={styles.case}>
                <SymbolView
                  name={{ ios: 'folder', android: 'folder', web: 'folder' }}
                  size={16}
                  tintColor={theme.textSecondary}
                />
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {caseName}
                </ThemedText>
              </View>
            )}
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
  case: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
