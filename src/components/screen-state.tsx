import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Full-screen placeholders for the three non-success states every data screen has. */

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  const theme = useTheme();
  return (
    <ThemedView style={styles.container} aria-busy>
      <ActivityIndicator color={theme.textSecondary} aria-label={label} />
    </ThemedView>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="smallBold" role="alert">
        {title}
      </ThemedText>
      {error instanceof Error && (
        <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
          {error.message}
        </ThemedText>
      )}
      {onRetry && <Button label="Try again" variant="secondary" onPress={onRetry} />}
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
