import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnalysisResult } from '@/shared/analysis/schema';

import { copyToClipboard } from '../clipboard';

/** How long «Copied» stays next to the value. */
export const COPIED_VISIBLE_MS = 2000;

type KeyFact = AnalysisResult['keyFacts'][number];

/**
 * A key fact (DET-6): label and value as in the document. A long press copies the value and says
 * «Copied», on screen and to screen readers. The value is never trimmed: the server drops a fact
 * that runs too long rather than cut an IBAN short (SPEC §7.4).
 */
function KeyFactRow({ fact }: { fact: KeyFact }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), COPIED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await copyToClipboard(fact.value);
    } catch {
      return;
    }
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(t('documents.keyFact.copied'));
  }

  return (
    <Pressable
      aria-label={`${fact.label}: ${fact.value}`}
      accessibilityHint={t('documents.keyFact.copyHint')}
      // «Copy» for screen readers: TalkBack's double-tap and hold says it, VoiceOver lists it among
      // the actions, where a long press is hard to find (task 6.2).
      accessibilityActions={[{ name: 'longpress', label: t('documents.keyFact.copy') }]}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'longpress') void copy();
      }}
      onLongPress={copy}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.label}>
        {fact.label}
      </ThemedText>
      <View style={styles.value}>
        <ThemedText type="code" style={styles.valueText}>
          {fact.value}
        </ThemedText>
        {copied && (
          <ThemedText type="smallBold" themeColor="tint">
            {t('documents.keyFact.copied')}
          </ThemedText>
        )}
      </View>
    </Pressable>
  );
}

/**
 * «Key facts» in one card (DET-6): a row per fact, label on the left and value on the right, with a
 * line between them. A value that doesn't fit beside its label goes under it.
 */
export function KeyFacts({ facts }: { facts: readonly KeyFact[] }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      {facts.map((fact, index) => (
        <View key={index}>
          {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          <KeyFactRow fact={fact} />
        </View>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.card,
    overflow: 'hidden',
  },
  row: {
    minHeight: MinTouchTarget + Spacing.one,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: Spacing.three,
    rowGap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two + Spacing.half,
  },
  label: {
    flexShrink: 1,
  },
  value: {
    flexGrow: 1,
    flexShrink: 1,
    alignItems: 'flex-end',
  },
  valueText: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'right',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: Spacing.three,
  },
});
