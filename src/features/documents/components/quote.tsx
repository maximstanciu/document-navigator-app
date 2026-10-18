import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type QuoteProps = {
  /** Verbatim, in the language of the original (SPEC §7.3). */
  quote: string;
  /** 1-based page of the original, when known. */
  page: number | null;
};

function useQuoteLabel(page: number | null) {
  const { t } = useTranslation();
  return page === null ? t('documents.quote.show') : t('documents.quote.showPage', { page });
}

/** A quote from the original with its page, set off by a rule (ANL-6, DET-5). */
export function QuoteText({ quote, page }: QuoteProps) {
  const theme = useTheme();
  const label = useQuoteLabel(page);
  return (
    <View style={[styles.quote, { borderColor: theme.border }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" style={styles.text}>
        {quote}
      </ThemedText>
    </View>
  );
}

/** The quote behind a toggle, so a deadline stays short until the person wants to check it (ANL-6). */
export function QuoteDisclosure({ quote, page }: QuoteProps) {
  const theme = useTheme();
  const label = useQuoteLabel(page);
  const [open, setOpen] = useState(false);

  return (
    <View style={styles.disclosure}>
      <Pressable
        role="button"
        aria-expanded={open}
        aria-label={label}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}>
        <ThemedText type="small" themeColor="tint">
          {label}
        </ThemedText>
        <SymbolView
          name={
            open
              ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' }
              : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }
          }
          size={16}
          tintColor={theme.tint}
        />
      </Pressable>
      {open && (
        <ThemedText type="small" style={[styles.quote, styles.text, { borderColor: theme.border }]}>
          {quote}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disclosure: {
    gap: Spacing.one,
  },
  toggle: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.one,
  },
  quote: {
    gap: Spacing.half,
    borderLeftWidth: 2,
    paddingLeft: Spacing.two,
  },
  text: {
    fontStyle: 'italic',
  },
  pressed: {
    opacity: 0.7,
  },
});
