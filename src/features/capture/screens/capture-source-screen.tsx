import { router, Stack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { DocumentSource } from '@/lib/db/types';

import { SourceOption } from '../components/source-option';

const SOURCES = [
  {
    source: 'scan',
    icon: { ios: 'doc.viewfinder', android: 'document_scanner', web: 'document_scanner' },
  },
  {
    source: 'gallery',
    icon: { ios: 'photo.on.rectangle', android: 'photo_library', web: 'photo_library' },
  },
  { source: 'file', icon: { ios: 'folder', android: 'folder_open', web: 'folder_open' } },
] as const satisfies readonly { source: DocumentSource; icon: SymbolViewProps['name'] }[];

/**
 * Where a new document comes from (CAP-1). The options stay disabled until their flows exist:
 * the scanner in task 2.2, gallery and files in task 2.3.
 */
export function CaptureSourceScreen() {
  const { t } = useTranslation();

  // Opened by a direct URL (web preview), the modal has nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.title') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {SOURCES.map(({ source, icon }) => (
          <SourceOption
            key={source}
            icon={icon}
            label={t(`capture.source.${source}`)}
            hint={t(`capture.sourceHint.${source}`)}
          />
        ))}
        <Button label={t('common.cancel')} variant="secondary" onPress={close} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
  },
});
