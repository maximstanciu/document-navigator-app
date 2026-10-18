import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnalysisResult, Level } from '@/shared/analysis/schema';

import { QuoteText } from './quote';

type Risk = AnalysisResult['risks'][number];

const LOOK: Record<
  Level,
  { icon: SymbolViewProps['name']; color: ThemeColor; background: ThemeColor }
> = {
  high: {
    icon: { ios: 'exclamationmark.octagon.fill', android: 'report', web: 'report' },
    color: 'riskHigh',
    background: 'riskHighBackground',
  },
  medium: {
    icon: { ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' },
    color: 'riskMedium',
    background: 'riskMediumBackground',
  },
  low: {
    icon: { ios: 'info.circle.fill', android: 'info', web: 'info' },
    color: 'riskLow',
    background: 'riskLowBackground',
  },
};

/**
 * A risk with its level as text and icon, not only color (DET-5, §8.4); the explanation and the
 * quote open on a press. Screen readers hear the level first.
 */
export function RiskItem({ risk }: { risk: Risk }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const look = LOOK[risk.severity];
  const level = t(`documents.risk.${risk.severity}`);

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Pressable
        role="button"
        aria-expanded={open}
        aria-label={`${level}: ${risk.title}`}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.header, pressed && styles.pressed]}>
        <View style={[styles.badge, { backgroundColor: theme[look.background] }]}>
          <SymbolView name={look.icon} size={16} tintColor={theme[look.color]} />
          <ThemedText type="smallBold" style={{ color: theme[look.color] }}>
            {level}
          </ThemedText>
        </View>
        <View style={styles.titleLine}>
          <ThemedText type="smallBold" style={styles.title}>
            {risk.title}
          </ThemedText>
          <SymbolView
            name={
              open
                ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
                : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
            }
            size={16}
            tintColor={theme.textSecondary}
          />
        </View>
      </Pressable>
      {open && (
        <View style={styles.details}>
          <ThemedText type="small">{risk.explanation}</ThemedText>
          {risk.sourceQuote && <QuoteText quote={risk.sourceQuote} page={risk.page} />}
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  header: {
    minHeight: MinTouchTarget,
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  details: {
    gap: Spacing.two,
  },
  pressed: {
    opacity: 0.7,
  },
});
