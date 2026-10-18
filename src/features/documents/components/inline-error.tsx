import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';

/** A part of the document screen that failed to load, with a retry that reloads it. */
export function InlineError({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <View style={styles.container}>
      <ThemedText type="small" role="alert">
        {t('documents.loadFailed')}
      </ThemedText>
      <Button label={t('common.retry')} variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
});
