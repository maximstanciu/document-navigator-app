import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { FlatList, StyleSheet } from 'react-native';

import { EmptyState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';

import { useCaptureSession } from '../capture-session';

/**
 * The pages of the document being added (CAP-5). Task 2.5 adds removing a page, «Scan more» and
 * «Analyze the document», which saves the draft.
 */
export function CaptureReviewScreen() {
  const { t } = useTranslation();
  const { pages } = useCaptureSession();

  return (
    <ThemedView style={styles.container}>
      <Stack.Screen options={{ title: t('capture.reviewTitle') }} />
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
