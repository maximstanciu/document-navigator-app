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
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { useCaptureSession } from '../capture-session';
import { SourceOption } from '../components/source-option';
import { checkPickedFiles, type PickedFilesCheck } from '../picked-files';
import { pickFile, pickPhotos } from '../pickers';
import { scanDocument } from '../scanner';
import type { CapturedPage } from '../types';

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

type Notice =
  | 'scannerUnavailable'
  | 'tooManyPages'
  | 'tooManyPhotos'
  | 'unsupportedPhoto'
  | 'unsupportedFile'
  | 'fileTooLarge'
  | 'pickerFailed';

type PickedSource = 'gallery' | 'file';

/** What to tell when picked files don't fit (CAP-3, CAP-7). */
const REJECTED_PICK_NOTICES: Record<
  PickedSource,
  Record<Exclude<PickedFilesCheck['status'], 'ok'>, Notice>
> = {
  gallery: {
    unsupported_type: 'unsupportedPhoto',
    too_many_pages: 'tooManyPhotos',
    too_large: 'fileTooLarge',
  },
  file: {
    unsupported_type: 'unsupportedFile',
    too_many_pages: 'tooManyPhotos',
    too_large: 'fileTooLarge',
  },
};

/** Where a new document comes from (CAP-1): the scanner, photos from the gallery or a file (CAP-3). */
export function CaptureSourceScreen() {
  const { t } = useTranslation();
  const session = useCaptureSession();
  const [notice, setNotice] = useState<Notice | null>(null);

  function review(source: DocumentSource, pages: CapturedPage[]) {
    setNotice(null);
    session.start(source, pages);
    router.push('/capture/review');
  }

  async function scan() {
    const result = await scanDocument({ maxPages: MAX_DOCUMENT_PAGES });
    if (result.status === 'scanned') {
      // Both system scanners save pages as JPEG.
      const pages = result.pages.map((uri) => ({
        uri,
        mimeType: 'image/jpeg' as const,
        size: null,
        name: null,
      }));
      review('scan', pages);
    } else if (result.status === 'unavailable') {
      // The other sources still work without the scanner (CAP-9).
      setNotice('scannerUnavailable');
    } else if (result.status === 'too_many_pages') {
      setNotice('tooManyPages');
    }
  }

  async function pick(source: PickedSource) {
    const result =
      source === 'gallery' ? await pickPhotos({ maxPages: MAX_DOCUMENT_PAGES }) : await pickFile();
    if (result.status === 'failed') setNotice('pickerFailed');
    if (result.status !== 'picked') return;
    const check = checkPickedFiles(source, result.files);
    if (check.status === 'ok') {
      review(source, check.pages);
    } else {
      setNotice(REJECTED_PICK_NOTICES[source][check.status]);
    }
  }

  const handlers: Record<DocumentSource, () => void> = {
    scan,
    gallery: () => pick('gallery'),
    file: () => pick('file'),
  };

  function noticeText(shown: Notice): string {
    switch (shown) {
      case 'tooManyPages':
      case 'tooManyPhotos':
        return t(`capture.${shown}`, { count: MAX_DOCUMENT_PAGES });
      case 'fileTooLarge':
        return t('capture.fileTooLarge', { limit: MAX_DOCUMENT_BYTES / (1024 * 1024) });
      default:
        return t(`capture.${shown}`);
    }
  }

  // Opened by a direct URL (web preview), the modal has nothing to go back to.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.title') }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        {notice && (
          <ThemedView type="backgroundElement" style={styles.notice}>
            <ThemedText type="small" role="alert">
              {noticeText(notice)}
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
