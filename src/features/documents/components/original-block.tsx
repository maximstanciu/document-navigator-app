import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Section } from '@/components/section';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { PressedOpacity, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { displayTitle } from '../format';
import { documentQueries } from '../queries';
import type { DocumentDetail, DocumentPage } from '../types';
import { InlineError } from './inline-error';
import { PdfOriginal } from './pdf-original';

/** A page thumbnail; pressed, it opens the pages full screen at this one (DET-7). */
function PageTile({ documentId, page }: { documentId: string; page: DocumentPage }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const number = page.index + 1;

  // The cell takes the share of the row, as on the review screen: on Android, expo-image with its
  // own percentage width here kept its space but never loaded (smoke test after task 4.2).
  return (
    <View style={styles.cell}>
      {page.uri === null ? (
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
      ) : (
        <Link
          href={{
            pathname: '/documents/[id]/pages',
            params: { id: documentId, page: String(number) },
          }}
          asChild>
          <Pressable
            role="link"
            aria-label={t('documents.original.page', { number })}
            style={({ pressed }) => pressed && styles.pressed}>
            <Image source={{ uri: page.uri }} contentFit="cover" style={styles.tile} />
          </Pressable>
        </Link>
      )}
    </View>
  );
}

/**
 * «Original» (DET-7): the page thumbnails, which open the pages full screen, or the PDF as a file
 * card with «Open» and «Share» (D-4). Pages whose files are gone show as such, and with none left
 * the block says the original isn't available; the rest of the screen works without it (STO-8).
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
  } else if (document.mimeType === 'application/pdf' && pages[0].uri !== null) {
    const file = {
      uri: pages[0].uri,
      mimeType: document.mimeType,
      title: displayTitle(document.title, t),
    };
    content = <PdfOriginal file={file} size={document.fileSize} />;
  } else {
    content = (
      <View style={styles.grid}>
        {pages.map((page) => (
          <PageTile key={page.id} documentId={document.id} page={page} />
        ))}
      </View>
    );
  }

  return <Section title={t('documents.section.original')}>{content}</Section>;
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  cell: {
    width: '31%',
  },
  tile: {
    width: '100%',
    // Close to A4, the most common page shape.
    aspectRatio: 0.71,
    borderRadius: Spacing.two,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: PressedOpacity,
  },
});
