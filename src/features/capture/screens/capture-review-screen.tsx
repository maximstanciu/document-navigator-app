import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { DocumentSource } from '@/lib/db/types';
import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { useCaptureSession } from '../capture-session';
import { CaptureStatus } from '../components/capture-status';
import { PageThumbnail } from '../components/page-thumbnail';
import { PdfFileCard } from '../components/pdf-file-card';
import { useSaveDraft } from '../queries';
import { useCapturePages } from '../use-capture-pages';

/** Where more pages come from: the scanner after a scan, the gallery after photos. */
const MORE_PAGES_FROM: Partial<Record<DocumentSource, 'scan' | 'gallery'>> = {
  scan: 'scan',
  gallery: 'gallery',
};

/**
 * The pages of the document being added, or the PDF file (CAP-5): remove a page, add more, then
 * «Analyze the document» saves a draft (SPEC §6.3) and opens it in place of the capture modal.
 */
export function CaptureReviewScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const session = useCaptureSession();
  const { source, pages } = session;
  const { notice, progress, capture } = useCapturePages();
  const saveDraft = useSaveDraft();

  const pdf = pages.find((page) => page.mimeType === 'application/pdf');
  const busy = progress !== null || saveDraft.isPending;
  const moreFrom = source && !pdf ? MORE_PAGES_FROM[source] : undefined;

  async function addMore() {
    if (!moreFrom) return;
    const added = await capture(moreFrom, pages);
    if (added) session.add(added);
  }

  function analyze() {
    if (!source) return;
    saveDraft.mutate(
      { source, pages },
      {
        // The document replaces the modal, so «Back» from it leads to the documents list.
        onSuccess: (id) => router.replace({ pathname: '/documents/[id]', params: { id } }),
      }
    );
  }

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.reviewTitle') }} />
      <FlatList
        data={pdf ? [] : pages}
        keyExtractor={(page) => page.uri}
        numColumns={3}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={
          <View style={styles.header}>
            <CaptureStatus progress={progress} notice={saveDraft.isError ? 'saveFailed' : notice} />
            {pdf ? (
              <PdfFileCard name={pdf.name} size={pdf.size} />
            ) : (
              pages.length > 0 && (
                <ThemedText type="smallBold">
                  {t('documents.pages', { count: pages.length })}
                </ThemedText>
              )
            )}
          </View>
        }
        ListEmptyComponent={pdf ? undefined : <EmptyState title={t('capture.noPages')} />}
        renderItem={({ item, index }) => (
          <PageThumbnail
            uri={item.uri}
            number={index + 1}
            onRemove={busy ? undefined : () => session.remove(index)}
          />
        )}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.content}
      />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, Spacing.three) }]}>
        {moreFrom && pages.length < MAX_DOCUMENT_PAGES && (
          <Button
            label={t(moreFrom === 'scan' ? 'capture.scanMore' : 'capture.addMorePhotos')}
            variant="secondary"
            disabled={busy}
            onPress={addMore}
          />
        )}
        <Button
          label={t('capture.analyze')}
          disabled={busy || pages.length === 0}
          onPress={analyze}
        />
      </View>
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
  header: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
  },
  footer: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
  },
});
