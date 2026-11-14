import { router, Stack } from 'expo-router';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useEffectEvent, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { DocumentSource } from '@/lib/db/types';

import { useCaptureSession } from '../capture-session';
import { CaptureStatus } from '../components/capture-status';
import { SourceOption } from '../components/source-option';
import { SCANNER_SUPPORTED } from '../scanner';
import type { CapturedPage } from '../types';
import { useCapturePages } from '../use-capture-pages';

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
 * Where a new document comes from (CAP-1): the scanner, photos from the gallery or a file (CAP-3).
 * Web has no scanner, so it offers only photos and files (CAP-10). The captured pages are prepared
 * for upload (CAP-4, CAP-7) before the review opens. Opened from a case (`caseId`), the review files
 * the new document there (CASE-4).
 *
 * With `share` (the key of a share, src/features/capture/share-link.ts), the screen first takes the
 * files another app shared into the app (CAP-11) the same way, and opens the review with them; a new
 * key takes the next share. When the files don't fit, the problem shows above the sources; when
 * nothing was shared (the share was taken already), it is the plain source choice.
 */
export function CaptureSourceScreen({ caseId, share }: { caseId?: string; share?: string }) {
  const { t } = useTranslation();
  const session = useCaptureSession();
  const { notice, progress, capture, captureShared } = useCapturePages();
  const sources = SOURCES.filter(({ source }) => source !== 'scan' || SCANNER_SUPPORTED);

  function review(source: DocumentSource, pages: CapturedPage[]) {
    session.start(source, pages);
    router.push({ pathname: '/capture/review', params: caseId ? { caseId } : {} });
  }

  async function choose(source: DocumentSource) {
    const pages = await capture(source);
    if (pages) review(source, pages);
  }

  // Once per share: «Back» from the review returns here without taking it again.
  const takenShare = useRef<string | undefined>(undefined);
  const takeShare = useEffectEvent(async (key: string) => {
    if (takenShare.current === key) return;
    takenShare.current = key;
    const taken = await captureShared();
    if (taken) review(taken.source, taken.pages);
  });
  useEffect(() => {
    if (share !== undefined) void takeShare(share);
  }, [share]);

  // Opened by a direct URL (web preview), the modal has nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.title') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <CaptureStatus progress={progress} notice={notice} />
        {sources.map(({ source, icon }) => (
          <SourceOption
            key={source}
            icon={icon}
            label={t(`capture.source.${source}`)}
            hint={t(`capture.sourceHint.${source}`)}
            onPress={progress ? undefined : () => choose(source)}
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
