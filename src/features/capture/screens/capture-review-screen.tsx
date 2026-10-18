import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, ScrollView, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

import { useCaptureSession } from '../capture-session';
import { PdfFileCard } from '../components/pdf-file-card';

/**
 * The pages of the document being added, or the PDF file (CAP-5). Task 2.5 adds removing a page,
 * «Scan more» and «Analyze the document», which saves the draft.
 */
export function CaptureReviewScreen() {
  const { t } = useTranslation();
  const { pages } = useCaptureSession();
  const pdf = pages.find((page) => page.mimeType === 'application/pdf');

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.reviewTitle') }} />
      {pdf ? (
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}>
          <PdfFileCard name={pdf.name} size={pdf.size} />
        </ScrollView>
      ) : (
        <FlatList
          data={pages}
          keyExtractor={(page) => page.uri}
          numColumns={3}
          contentInsetAdjustmentBehavior="automatic"
          ListHeaderComponent={
            pages.length > 0 ? (
              <ThemedText type="smallBold">
                {t('documents.pages', { count: pages.length })}
              </ThemedText>
            ) : undefined
          }
          ListEmptyComponent={<EmptyState title={t('capture.noPages')} />}
          renderItem={({ item, index }) => (
            <Image
              source={{ uri: item.uri }}
              accessible
              alt={t('capture.pageLabel', { number: index + 1 })}
              contentFit="cover"
              style={styles.thumbnail}
            />
          )}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.content}
        />
      )}
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
  row: {
    gap: Spacing.two,
  },
  thumbnail: {
    width: '31%',
    // Close to A4, the most common page shape.
    aspectRatio: 0.71,
    borderRadius: Spacing.two,
  },
});
