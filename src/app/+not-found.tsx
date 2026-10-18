import { Link, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  const { t } = useTranslation();
  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('notFound.title') }} />
      <ThemedText type="smallBold" role="heading">
        {t('notFound.message')}
      </ThemedText>
      <Link href="/" replace>
        <ThemedText type="linkPrimary">{t('notFound.goToDocuments')}</ThemedText>
      </Link>
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
});
