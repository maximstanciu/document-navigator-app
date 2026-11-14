import type { TFunction } from 'i18next';
import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { formatDueIn } from '@/features/deadlines/format';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate } from '@/lib/i18n/format';
import { daysBetween } from '@/shared/calendar-date';

import type { AttentionItem } from '../attention';
import { displayTitle } from '../format';
import { useDismissAttention } from '../queries';
import type { DeadlineSummary } from '../types';

/** A warning named in words with an icon, never by color alone. */
function WarningBadge({
  icon,
  color,
  label,
}: {
  icon: SymbolViewProps['name'];
  color: ThemeColor;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.badge}>
      <SymbolView name={icon} size={18} tintColor={theme[color]} />
      <ThemedText type="smallBold" style={{ color: theme[color] }}>
        {label}
      </ThemedText>
    </View>
  );
}

/** «In 3 days · 21 Oct 2026»: how soon, and when exactly. */
function dueText(deadline: DeadlineSummary, today: string, t: TFunction, language: string) {
  const date = formatCalendarDate(deadline.dueDate, language);
  return {
    when: formatDueIn(deadline.dueDate, today, t),
    date: deadline.dueTime ? `${date}, ${deadline.dueTime}` : date,
    overdue: deadline.dueDate < today,
  };
}

function DueLine({ deadline, today }: { deadline: DeadlineSummary; today: string }) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { when, date, overdue } = dueText(deadline, today, t, i18n.language);
  return (
    <View>
      <ThemedText type="smallBold">
        <ThemedText type="smallBold" style={overdue && { color: theme.riskHigh }}>
          {when}
        </ThemedText>
        {` · ${date}`}
      </ThemedText>
      <ThemedText type="small" numberOfLines={2}>
        {deadline.description}
      </ThemedText>
    </View>
  );
}

/** What a screen reader says for an item: the whole card is one link. */
function itemLabel(item: AttentionItem, today: string, t: TFunction, language: string) {
  const { document, deadlines } = item;
  const [nearest, ...others] = deadlines;
  const due = nearest && dueText(nearest, today, t, language);
  return [
    displayTitle(document.title, t),
    due && `${due.when} · ${due.date}`,
    nearest?.description,
    others.length > 0 ? t('documents.attention.moreDeadlines', { count: others.length }) : null,
    document.hasFraudSignals ? t('documents.attention.fraud') : null,
    document.hasHighRisk ? t('documents.risk.high') : null,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Fraud signs and a high risk, each in words with an icon. */
function Warnings({
  item,
  fraudColor,
  riskColor,
}: {
  item: AttentionItem;
  fraudColor: ThemeColor;
  riskColor: ThemeColor;
}) {
  const { t } = useTranslation();
  const { document } = item;
  if (!document.hasFraudSignals && !document.hasHighRisk) return null;
  return (
    <View style={styles.badges}>
      {document.hasFraudSignals && (
        <WarningBadge
          icon={{ ios: 'exclamationmark.shield.fill', android: 'gpp_maybe', web: 'gpp_maybe' }}
          color={fraudColor}
          label={t('documents.attention.fraud')}
        />
      )}
      {document.hasHighRisk && (
        <WarningBadge
          icon={{ ios: 'exclamationmark.octagon.fill', android: 'report', web: 'report' }}
          color={riskColor}
          label={t('documents.risk.high')}
        />
      )}
    </View>
  );
}

function DismissButton({ item, variant }: { item: AttentionItem; variant: 'plain' | 'inverse' }) {
  const { t } = useTranslation();
  const dismiss = useDismissAttention();
  if (!item.dismissible) return null;
  return (
    <Button
      label={t('documents.attention.gotIt')}
      aria-label={t('documents.attention.gotItLabel', {
        title: displayTitle(item.document.title, t),
      })}
      variant={variant}
      disabled={dismiss.isPending}
      onPress={() => dismiss.mutate(item.document.id)}
    />
  );
}

/** The big countdown on the lead card: how many days are left or overdue, or «Today». */
function Countdown({ dueDate, today }: { dueDate: string; today: string }) {
  const { t } = useTranslation();
  const days = daysBetween(today, dueDate);
  if (days === 0 || days === 1) {
    return (
      <ThemedText type="display" themeColor="onInverse" style={styles.countdownWord}>
        {t(days === 0 ? 'deadlines.dueIn.today' : 'deadlines.dueIn.tomorrow')}
      </ThemedText>
    );
  }
  const count = Math.abs(days);
  return (
    <View style={styles.countdown}>
      <ThemedText type="display" themeColor="onInverse">
        {count}
      </ThemedText>
      <ThemedText type="lead" themeColor="onInverse" style={styles.countdownUnit}>
        {t(days < 0 ? 'documents.attention.daysOverdue' : 'documents.attention.daysLeft', {
          count,
        })}
      </ThemedText>
    </View>
  );
}

/**
 * The first item, when it has a deadline, leads the tab on the inverse card: the countdown in big
 * numbers, then what to do and in which document.
 */
function LeadCard({
  item,
  nearest,
  today,
}: {
  item: AttentionItem;
  nearest: DeadlineSummary;
  today: string;
}) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { document, deadlines } = item;
  const due = dueText(nearest, today, t, i18n.language);
  const others = deadlines.length - 1;

  return (
    <View style={[styles.lead, { backgroundColor: theme.inverse }]}>
      <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
        <Pressable role="link" aria-label={itemLabel(item, today, t, i18n.language)}>
          {({ pressed }) => (
            <View style={[styles.leadBody, pressed && styles.pressed]}>
              <ThemedText type="label" themeColor="onInverseSecondary">
                {due.date}
              </ThemedText>
              <Countdown dueDate={nearest.dueDate} today={today} />
              <View style={styles.body}>
                <ThemedText type="lead" themeColor="onInverse" numberOfLines={3}>
                  {nearest.description}
                </ThemedText>
                <ThemedText type="small" themeColor="onInverseSecondary" numberOfLines={2}>
                  {displayTitle(document.title, t)}
                </ThemedText>
                {others > 0 && (
                  <ThemedText type="small" themeColor="onInverseSecondary">
                    {t('documents.attention.moreDeadlines', { count: others })}
                  </ThemedText>
                )}
              </View>
              <Warnings item={item} fraudColor="onInverse" riskColor="onInverse" />
            </View>
          )}
        </Pressable>
      </Link>
      <DismissButton item={item} variant="inverse" />
    </View>
  );
}

function AttentionCard({ item, today }: { item: AttentionItem; today: string }) {
  const { t, i18n } = useTranslation();
  const { document, deadlines } = item;
  const [nearest, ...others] = deadlines;
  const more =
    others.length > 0 ? t('documents.attention.moreDeadlines', { count: others.length }) : null;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
        <Pressable role="link" aria-label={itemLabel(item, today, t, i18n.language)}>
          {/* Styled inside: `Link asChild` drops a style function on the Pressable, and with it
              the spacing and the pressed feedback (task 6.2). */}
          {({ pressed }) => (
            <View style={[styles.body, pressed && styles.pressed]}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {displayTitle(document.title, t)}
              </ThemedText>
              {nearest && <DueLine deadline={nearest} today={today} />}
              {more && (
                <ThemedText type="small" themeColor="textSecondary">
                  {more}
                </ThemedText>
              )}
              <Warnings item={item} fraudColor="fraudWarning" riskColor="riskHigh" />
            </View>
          )}
        </Pressable>
      </Link>
      <DismissButton item={item} variant="plain" />
    </ThemedView>
  );
}

type AttentionBlockProps = {
  items: readonly AttentionItem[];
  /** The device's calendar date the items were selected for. */
  today: string;
};

/**
 * «Needs attention» at the top of the documents tab (HOME-1): deadlines that are overdue or near,
 * and fresh fraud signs and high risks. Nothing at all when there is nothing to attend to.
 */
export function AttentionBlock({ items, today }: AttentionBlockProps) {
  const { t } = useTranslation();
  if (items.length === 0) return null;

  return (
    <View style={styles.block}>
      <ThemedText type="label" role="heading" themeColor="textSecondary">
        {t('documents.attention.title')}
      </ThemedText>
      {items.map((item, index) => {
        const nearest = item.deadlines[0];
        return index === 0 && nearest ? (
          <LeadCard key={item.document.id} item={item} nearest={nearest} today={today} />
        ) : (
          <AttentionCard key={item.document.id} item={item} today={today} />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  lead: {
    padding: Spacing.four - Spacing.one,
    borderRadius: Radius.hero,
    gap: Spacing.three,
  },
  leadBody: {
    gap: Spacing.three,
  },
  countdown: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
  },
  countdownUnit: {
    flexShrink: 1,
    paddingBottom: Spacing.two,
  },
  countdownWord: {
    fontSize: 56,
    lineHeight: 60,
    letterSpacing: -2,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Radius.card,
    gap: Spacing.one,
  },
  body: {
    gap: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: Spacing.three,
    rowGap: Spacing.one,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
