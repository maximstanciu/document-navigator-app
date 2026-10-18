import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Full-screen placeholders for the three non-success states every data screen has. */

export function LoadingState({ label }: { label?: string }) {
  const theme = useTheme();
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container} aria-busy>
      <ActivityIndicator color={theme.textSecondary} aria-label={label ?? t('common.loading')} />
    </ThemedView>
  );
}

export function ErrorState({
  title,
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold" role="alert">
        {title ?? t('common.errorTitle')}
      </ThemedText>
      {error instanceof Error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {error.message}
        </ThemedText>
      )}
      {onRetry && <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />}
    </ThemedView>
  );
}

export function EmptyState({ title, message }: { title: string; message?: string }) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {message && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {message}
        </ThemedText>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
  },
  center: {
    textAlign: 'center',
  },
});
