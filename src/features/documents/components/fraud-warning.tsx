import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { AnalysisResult } from '@/shared/analysis/schema';

import { QuoteDisclosure } from './quote';

/**
 * «Signs of fraud» right under the title (DET-10, ANL-11): what looks wrong and what to do about
 * it. The analysis lists signs and never says the letter is fraud; the heading says «signs» too.
 * Text and an icon carry the warning, the color only adds to them.
 */
export function FraudWarning({ signals }: { signals: AnalysisResult['fraudSignals'] }) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.fraudWarningBackground, borderColor: theme.fraudWarning },
      ]}>
      <View style={styles.header}>
        <SymbolView
          name={{ ios: 'exclamationmark.shield.fill', android: 'gpp_maybe', web: 'gpp_maybe' }}
          size={24}
          tintColor={theme.fraudWarning}
        />
        <ThemedText
          type="smallBold"
          role="heading"
          style={[styles.title, { color: theme.fraudWarning }]}>
          {t('documents.fraud.title')}
        </ThemedText>
      </View>
      {signals.map((signal, index) => (
        <View key={index} style={styles.signal}>
          <View style={[styles.bullet, { backgroundColor: theme.fraudWarning }]} />
          <View style={styles.signalText}>
            <ThemedText type="small">{signal.explanation}</ThemedText>
            {signal.sourceQuote && (
              <QuoteDisclosure quote={signal.sourceQuote} page={signal.page} />
            )}
          </View>
        </View>
      ))}
      <ThemedText type="smallBold">{t('documents.fraud.advice')}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  title: {
    flex: 1,
  },
  signal: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 7,
  },
  signalText: {
    flex: 1,
    gap: Spacing.one,
  },
});
