import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTimestampDateTime } from '@/lib/i18n/format';

import { limitsQuery } from '../queries';

/**
 * What is left of today's analyses and when the limit resets, in local time (SET-4). Asks the server,
 * so it can fail without a network: then it says so and offers to try again.
 */
export function RemainingAnalyses() {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const { data, isError, isFetching, refetch } = useQuery(limitsQuery());

  if (data) {
    return (
      <View style={styles.container}>
        <ThemedText type="small">
          {t('analysis.limits.remaining', { remaining: data.remaining, limit: data.dailyLimit })}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('analysis.limits.resetsAt', {
            time: formatTimestampDateTime(data.resetsAt, i18n.language),
          })}
        </ThemedText>
      </View>
    );
  }
  if (isError) {
    return (
      <View style={styles.container}>
        <ThemedText type="small" role="alert">
          {t('analysis.limits.failed')}
        </ThemedText>
        <Button
          label={t('common.retry')}
          variant="secondary"
          disabled={isFetching}
          onPress={() => refetch()}
        />
      </View>
    );
  }
  return (
    <View style={styles.loading} aria-busy>
      <ActivityIndicator color={theme.textSecondary} aria-label={t('analysis.limits.loading')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.one,
  },
  loading: {
    alignItems: 'flex-start',
  },
});
