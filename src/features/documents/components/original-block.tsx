import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { PdfFileCard } from '@/features/capture/components/pdf-file-card';
import { useTheme } from '@/hooks/use-theme';

import { documentQueries } from '../queries';
import type { DocumentDetail, DocumentPage } from '../types';
import { DetailSection } from './detail-section';
import { InlineError } from './inline-error';

function PageTile({ page }: { page: DocumentPage }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const number = page.index + 1;

  if (page.uri === null) {
    return (
      <ThemedView
        type="backgroundElement"
        style={[styles.tile, styles.missing]}
        accessible
        aria-label={t('documents.original.pageMissing', { number })}>
        <SymbolView
          name={{ ios: 'photo', android: 'broken_image', web: 'broken_image' }}
          size={24}
          tintColor={theme.textSecondary}
        />
      </ThemedView>
    );
  }
  return (
    <Image
      source={{ uri: page.uri }}
      accessible
      alt={t('documents.original.page', { number })}
      contentFit="cover"
      style={styles.tile}
    />
  );
}

/**
 * «Original» (DET-7): the page thumbnails, or the PDF as a file card (D-4). Pages whose files are
 * gone show as such, and with none left the block says the original isn't available; the rest of
 * the screen works without it (STO-8). The full-screen viewer and «Open in…» arrive in task 4.3.
 */
export function OriginalBlock({ document }: { document: DocumentDetail }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const { data: pages, error, isPending, refetch } = useQuery(documentQueries.pages(document.id));

  let content;
  if (isPending) {
    content = <ActivityIndicator color={theme.textSecondary} aria-label={t('common.loading')} />;
  } else if (error) {
    content = <InlineError onRetry={() => refetch()} />;
  } else if (pages.every((page) => page.uri === null)) {
    content = (
      <ThemedText type="small" themeColor="textSecondary">
        {t('documents.original.unavailable')}
      </ThemedText>
    );
  } else if (document.mimeType === 'application/pdf') {
    content = <PdfFileCard name={null} size={document.fileSize} />;
  } else {
    content = (
      <View style={styles.grid}>
        {pages.map((page) => (
          <PageTile key={page.id} page={page} />
        ))}
      </View>
    );
  }

  return <DetailSection title={t('documents.section.original')}>{content}</DetailSection>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: '31%',
    // Close to A4, the most common page shape.
    aspectRatio: 0.71,
    borderRadius: Spacing.two,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
