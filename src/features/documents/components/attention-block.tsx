import type { TFunction } from 'i18next';
import { Link } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCalendarDate } from '@/lib/i18n/format';

import type { AttentionItem } from '../attention';
import { displayTitle, formatDueIn } from '../format';
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

function AttentionCard({ item, today }: { item: AttentionItem; today: string }) {
  const { t, i18n } = useTranslation();
  const dismiss = useDismissAttention();
  const { document, deadlines, dismissible } = item;
  const [nearest, ...others] = deadlines;
  const title = displayTitle(document.title, t);
  const due = nearest && dueText(nearest, today, t, i18n.language);
  const more =
    others.length > 0 ? t('documents.attention.moreDeadlines', { count: others.length }) : null;
  const warnings = [
    document.hasFraudSignals ? t('documents.attention.fraud') : null,
    document.hasHighRisk ? t('documents.risk.high') : null,
  ];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
        <Pressable
          role="link"
          aria-label={[
            title,
            due && `${due.when} · ${due.date}`,
            nearest?.description,
            more,
            ...warnings,
          ]
            .filter(Boolean)
            .join(', ')}
          style={({ pressed }) => [styles.body, pressed && styles.pressed]}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {title}
          </ThemedText>
          {nearest && <DueLine deadline={nearest} today={today} />}
          {more && (
            <ThemedText type="small" themeColor="textSecondary">
              {more}
            </ThemedText>
          )}
          {(document.hasFraudSignals || document.hasHighRisk) && (
            <View style={styles.badges}>
              {document.hasFraudSignals && (
                <WarningBadge
                  icon={{
                    ios: 'exclamationmark.shield.fill',
                    android: 'gpp_maybe',
                    web: 'gpp_maybe',
                  }}
                  color="fraudWarning"
                  label={t('documents.attention.fraud')}
                />
              )}
              {document.hasHighRisk && (
                <WarningBadge
                  icon={{ ios: 'exclamationmark.octagon.fill', android: 'report', web: 'report' }}
                  color="riskHigh"
                  label={t('documents.risk.high')}
                />
              )}
            </View>
          )}
        </Pressable>
      </Link>
      {dismissible && (
        <Button
          label={t('documents.attention.gotIt')}
          aria-label={t('documents.attention.gotItLabel', { title })}
          variant="plain"
          disabled={dismiss.isPending}
          onPress={() => dismiss.mutate(document.id)}
        />
      )}
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
      <ThemedText type="smallBold" role="heading">
        {t('documents.attention.title')}
      </ThemedText>
      {items.map((item) => (
        <AttentionCard key={item.document.id} item={item} today={today} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
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
