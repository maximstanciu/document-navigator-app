import { router, Stack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { DocumentSource } from '@/lib/db/types';
import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { useCaptureSession } from '../capture-session';
import { SourceOption } from '../components/source-option';
import { scanDocument } from '../scanner';

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

type Notice = 'scannerUnavailable' | 'tooManyPages';

/**
 * Where a new document comes from (CAP-1). Scanning hands the pages to review; gallery and files
 * stay disabled until task 2.3.
 */
export function CaptureSourceScreen() {
  const { t } = useTranslation();
  const session = useCaptureSession();
  const [notice, setNotice] = useState<Notice | null>(null);

  async function scan() {
    const result = await scanDocument({ maxPages: MAX_DOCUMENT_PAGES });
    if (result.status === 'scanned') {
      setNotice(null);
      session.start(
        'scan',
        result.pages.map((uri) => ({ uri }))
      );
      router.push('/capture/review');
    } else if (result.status === 'unavailable') {
      // The other sources still work without the scanner (CAP-9).
      setNotice('scannerUnavailable');
    } else if (result.status === 'too_many_pages') {
      setNotice('tooManyPages');
    }
  }

  const handlers: Partial<Record<DocumentSource, () => void>> = { scan };

  // Opened by a direct URL (web preview), the modal has nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.title') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {notice && (
          <ThemedView type="backgroundElement" style={styles.notice}>
            <ThemedText type="small" role="alert">
              {notice === 'tooManyPages'
                ? t('capture.tooManyPages', { count: MAX_DOCUMENT_PAGES })
                : t('capture.scannerUnavailable')}
            </ThemedText>
          </ThemedView>
        )}
        {SOURCES.map(({ source, icon }) => (
          <SourceOption
            key={source}
            icon={icon}
            label={t(`capture.source.${source}`)}
            hint={t(`capture.sourceHint.${source}`)}
            onPress={handlers[source]}
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
  notice: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
});
