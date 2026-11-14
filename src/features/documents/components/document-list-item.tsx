import type { TFunction } from 'i18next';
import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { formatDueIn } from '@/features/deadlines/format';
import { THIS_WEEK_DAYS } from '@/features/deadlines/timeline';
import { useTheme } from '@/hooks/use-theme';
import { countryFlag, countryName } from '@/lib/i18n/display-names';
import { formatCalendarDate, formatShortCalendarDate } from '@/lib/i18n/format';
import type { DocumentType } from '@/shared/analysis/schema';
import { daysBetween } from '@/shared/calendar-date';

import { displayTitle, formatDocumentType, formatMeta } from '../format';
import type { DeadlineSummary, DocumentSummary } from '../types';

const PLAIN_DOCUMENT: SymbolViewProps['name'] = {
  ios: 'doc.text',
  android: 'description',
  web: 'description',
};

/** The tile on the left of a row, by the type of the document. Decoration: the type is in words. */
const TYPE_ICONS: Record<DocumentType, SymbolViewProps['name']> = {
  letter: { ios: 'envelope', android: 'mail', web: 'mail' },
  invoice: { ios: 'bolt', android: 'receipt_long', web: 'receipt_long' },
  contract: { ios: 'signature', android: 'handshake', web: 'handshake' },
  official_notice: { ios: 'building.columns', android: 'account_balance', web: 'account_balance' },
  fine: { ios: 'exclamationmark.triangle', android: 'warning', web: 'warning' },
  tax: { ios: 'percent', android: 'percent', web: 'percent' },
  insurance: { ios: 'shield', android: 'shield', web: 'shield' },
  bank: { ios: 'creditcard', android: 'credit_card', web: 'credit_card' },
  medical: { ios: 'cross.case', android: 'medical_services', web: 'medical_services' },
  other: PLAIN_DOCUMENT,
  unknown: PLAIN_DOCUMENT,
};

/** Within this many days, or overdue, the deadline's pill is tinted; its words say how soon. */
const URGENT_DAYS = 3;

/**
 * The pill on the right of a row: «Просрочено», «Сегодня», «Завтра», «3 дня» within the week, the
 * date after it.
 */
function duePill(deadline: DeadlineSummary, today: string, t: TFunction, language: string) {
  const days = daysBetween(today, deadline.dueDate);
  let text: string;
  if (days < 2) text = formatDueIn(deadline.dueDate, today, t);
  else if (days < THIS_WEEK_DAYS) text = t('documents.deadline.inDaysShort', { count: days });
  else text = formatShortCalendarDate(deadline.dueDate, today, language);
  return { text, urgent: days <= URGENT_DAYS };
}

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
 * A document in the list (HOME-2): title, type and sender, the nearest deadline on a pill to the
 * right, when it was added, its pages, the analysis status until it is analyzed, the flag of its
 * country (DET-11), and its case (CASE-3). A screen reader hears the deadline's full date.
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
  const pill = nearestDeadline && duePill(nearestDeadline, today, t, i18n.language);
  if (nearestDeadline) {
    const date = formatCalendarDate(nearestDeadline.dueDate, i18n.language);
    const due = nearestDeadline.dueTime
      ? t('documents.deadline.dueAt', { date, time: nearestDeadline.dueTime })
      : t('documents.deadline.due', { date });
    dueLine = overdue ? `${due} · ${t('documents.deadline.overdue')}` : due;
  }
  const meta = formatMeta(document, t, i18n.language);
  // 🇵🇹 on the card; a screen reader says the country's name.
  const metaLine = [meta, document.country && countryFlag(document.country)]
    .filter(Boolean)
    .join(' · ');
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
            <ThemedView type="background" style={styles.tile}>
              <SymbolView
                name={document.documentType ? TYPE_ICONS[document.documentType] : PLAIN_DOCUMENT}
                size={20}
                tintColor={theme.text}
              />
            </ThemedView>
            <View style={styles.text}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {title}
              </ThemedText>
              {from !== '' && (
                <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                  {from}
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
            </View>
            {pill && (
              // Tinted when it is near or has passed; the words say so too.
              <ThemedView
                type={pill.urgent ? 'riskHighBackground' : 'background'}
                style={styles.due}>
                <ThemedText
                  type="code"
                  themeColor={pill.urgent ? 'riskHigh' : 'text'}
                  style={styles.dueText}>
                  {pill.text}
                </ThemedText>
              </ThemedView>
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
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three - Spacing.one,
    borderRadius: Radius.card,
    gap: Spacing.three - Spacing.one,
  },
  tile: {
    width: MinTouchTarget,
    height: MinTouchTarget,
    borderRadius: Radius.tile,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
    gap: Spacing.half,
    paddingVertical: Spacing.half,
  },
  due: {
    flexShrink: 0,
    paddingHorizontal: Spacing.two + Spacing.half,
    paddingVertical: Spacing.one + Spacing.half,
    borderRadius: Radius.tile - Spacing.half,
  },
  dueText: {
    lineHeight: 16,
  },
  case: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
