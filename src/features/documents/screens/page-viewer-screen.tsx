import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FlatList,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type FlatListInstance,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState, ErrorState, LoadingState } from '@/components/screen-state';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { HeaderIconButton } from '@/components/ui/header-icon-button';
import {
  ContentColumn,
  DisabledOpacity,
  MinTouchTarget,
  PressedOpacity,
  Spacing,
} from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { PdfOriginal } from '../components/pdf-original';
import { displayTitle } from '../format';
import type { OriginalFile } from '../original-file';
import { documentQueries } from '../queries';
import type { DocumentPage } from '../types';
import { useOriginalFile } from '../use-original-file';

type Size = { width: number; height: number };

/**
 * A page fills the list: its size is given, since the list's own cell wrappers don't stretch their
 * content to its height (the image came out 0 pt tall).
 */
function PageView({ page, size }: { page: DocumentPage; size: Size }) {
  const theme = useTheme();
  const { t } = useTranslation();
  const number = page.index + 1;

  if (page.uri === null) {
    return (
      <View style={[styles.page, styles.missing, size]}>
        <SymbolView
          name={{ ios: 'photo', android: 'broken_image', web: 'broken_image' }}
          size={40}
          tintColor={theme.textSecondary}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('documents.original.pageMissing', { number })}
        </ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.page, size]}>
      <Image
        source={{ uri: page.uri }}
        accessible
        alt={t('documents.original.page', { number })}
        contentFit="contain"
        style={styles.image}
      />
    </View>
  );
}

function StepButton({
  label,
  direction,
  disabled,
  onPress,
}: {
  label: string;
  direction: 'previous' | 'next';
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <SymbolView
        name={
          direction === 'previous'
            ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
            : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
        }
        size={24}
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

/**
 * The pages of the original full screen, swiped through (DET-7), opened at page `initialIndex`.
 * The header opens the shown page in the system viewer, which zooms, or shares it to be saved or
 * sent. The buttons below step through the pages without swiping (screen readers, web). A page
 * whose file is gone shows as such (STO-8). A PDF has no pages to draw (D-4): its card shows.
 */
export function PageViewerScreen({ id, initialIndex }: { id: string; initialIndex: number }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const document = useQuery(documentQueries.detail(id));
  const pages = useQuery(documentQueries.pages(id));
  const actions = useOriginalFile();
  const list = useRef<FlatListInstance>(null);
  const [current, setCurrent] = useState(initialIndex);
  // The list's height once laid out; until then the pages are 0 pt tall for a frame.
  const [height, setHeight] = useState(0);

  if (document.isPending || pages.isPending) {
    return <LoadingState label={t('documents.loadingOne')} />;
  }
  if (document.error || pages.error) {
    return (
      <ErrorState
        error={document.error ?? pages.error}
        onRetry={() => {
          document.refetch();
          pages.refetch();
        }}
      />
    );
  }
  if (!document.data) {
    return (
      <EmptyState title={t('documents.notFoundTitle')} message={t('documents.notFoundMessage')} />
    );
  }

  const title = displayTitle(document.data.title, t);
  const all = pages.data;
  if (all.length === 0 || all.every((page) => page.uri === null)) {
    return (
      <>
        <Stack.Screen options={{ title }} />
        <EmptyState title={t('documents.original.unavailable')} />
      </>
    );
  }
  if (document.data.mimeType === 'application/pdf' && all[0].uri !== null) {
    const file = { uri: all[0].uri, mimeType: document.data.mimeType, title };
    return (
      <ThemedView style={styles.pdf}>
        <Stack.Screen options={{ title }} />
        <PdfOriginal file={file} size={document.data.fileSize} />
      </ThemedView>
    );
  }

  const index = Math.min(Math.max(current, 0), all.length - 1);
  const number = index + 1;
  const shown = all[index];
  const file: OriginalFile | null =
    shown.uri === null ? null : { uri: shown.uri, mimeType: document.data.mimeType, title };

  const goTo = (target: number) => {
    setCurrent(target);
    list.current?.scrollToIndex({ index: target, animated: true });
  };
  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const settled = Math.round(event.nativeEvent.contentOffset.x / width);
    if (settled !== index && settled >= 0 && settled < all.length) setCurrent(settled);
  };

  return (
    <ThemedView style={[styles.screen, { paddingBottom: insets.bottom }]}>
      <Stack.Screen
        options={{
          title,
          headerRight: () =>
            file && (
              <View style={styles.headerButtons}>
                <HeaderIconButton
                  label={t('documents.viewer.openPage', { number })}
                  icon={{ ios: 'arrow.up.forward.app', android: 'open_in_new', web: 'open_in_new' }}
                  onPress={() => actions.open(file)}
                />
                <HeaderIconButton
                  label={t('documents.viewer.sharePage', { number })}
                  icon={{ ios: 'square.and.arrow.up', android: 'share', web: 'download' }}
                  onPress={() => actions.share(file)}
                />
              </View>
            ),
        }}
      />
      <FlatList
        // A new width (rotation, a resized window) moves every page: start over at the shown one.
        key={width}
        ref={list}
        style={styles.viewport}
        data={all}
        keyExtractor={(page) => page.id}
        renderItem={({ item }) => <PageView page={item} size={{ width, height }} />}
        extraData={height}
        onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={index}
        getItemLayout={(_, item) => ({ length: width, offset: width * item, index: item })}
        onScroll={onScroll}
        scrollEventThrottle={16}
      />
      {actions.failed && (
        <ThemedText type="small" role="alert" style={styles.error}>
          {t('documents.original.openFailed')}
        </ThemedText>
      )}
      {all.length > 1 && (
        <View style={styles.toolbar}>
          <StepButton
            label={t('documents.viewer.previous')}
            direction="previous"
            disabled={index === 0}
            onPress={() => goTo(index - 1)}
          />
          <ThemedText type="smallBold" aria-live="polite">
            {t('documents.viewer.position', { number, total: all.length })}
          </ThemedText>
          <StepButton
            label={t('documents.viewer.next')}
            direction="next"
            disabled={index === all.length - 1}
            onPress={() => goTo(index + 1)}
          />
        </View>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  viewport: {
    flex: 1,
  },
  page: {
    padding: Spacing.two,
  },
  image: {
    flex: 1,
  },
  missing: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  headerButtons: {
    flexDirection: 'row',
  },
  error: {
    paddingHorizontal: Spacing.four,
    textAlign: 'center',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingVertical: Spacing.two,
  },
  step: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: PressedOpacity,
  },
  disabled: {
    opacity: DisabledOpacity,
  },
  pdf: {
    flex: 1,
    padding: Spacing.four,
    ...ContentColumn,
  },
});
