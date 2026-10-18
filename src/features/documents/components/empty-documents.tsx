import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { SCANNER_SUPPORTED } from '@/features/capture/scanner';
import { useTheme } from '@/hooks/use-theme';

/**
 * The documents tab before the first document (HOME-5): what the app does and one big button to
 * start. It opens the choice of source with the scanner first; web has no scanner (CAP-10), so
 * there it offers to add a document.
 */
export function EmptyDocuments() {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <View style={styles.container}>
      <SymbolView
        name={{ ios: 'doc.viewfinder', android: 'document_scanner', web: 'document_scanner' }}
        size={56}
        tintColor={theme.tint}
      />
      <ThemedText type="default" role="heading" style={[styles.center, styles.title]}>
        {t('documents.empty.title')}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
        {t('documents.empty.message')}
      </ThemedText>
      <View style={styles.action}>
        <Button
          label={SCANNER_SUPPORTED ? t('documents.empty.scan') : t('documents.addDocument')}
          onPress={() => router.push('/capture')}
        />
      </View>
    </View>
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
  title: {
    fontWeight: 700,
  },
  center: {
    textAlign: 'center',
  },
  action: {
    width: '100%',
    maxWidth: 400,
  },
});
