import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
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
export function KeyFactRow({ fact }: { fact: KeyFact }) {
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
      onLongPress={copy}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {fact.label}
      </ThemedText>
      <ThemedText type="default">{fact.value}</ThemedText>
      {copied && (
        <ThemedText type="smallBold" themeColor="tint">
          {t('documents.keyFact.copied')}
        </ThemedText>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    gap: Spacing.half,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
});
