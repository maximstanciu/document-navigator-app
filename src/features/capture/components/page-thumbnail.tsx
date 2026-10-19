import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import {
  AccessibilityInfo,
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const REMOVE_SIZE = 32;

type PageThumbnailProps = {
  uri: string;
  /** 1-based, as people count pages. */
  number: number;
  /** How many pages the document has, so the last one isn't offered to move further. */
  count: number;
  /** Without a handler the page can't be removed (e.g. while pages are prepared). */
  onRemove?: () => void;
  /**
   * Moves the page one place earlier (`-1`) or later (`1`): the screen reader's way to change the
   * order, which others change by dragging (CAP-6). Without a handler the page stays in place.
   */
  onMove?: (offset: -1 | 1) => void;
};

/**
 * A page on the review screen, filling its cell in the grid, with a button to remove it (CAP-5) and
 * screen reader actions to move it (CAP-6).
 */
export function PageThumbnail({ uri, number, count, onRemove, onMove }: PageThumbnailProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  const actions = onMove
    ? [
        ...(number > 1 ? [{ name: 'moveEarlier', label: t('capture.movePageEarlier') }] : []),
        ...(number < count ? [{ name: 'moveLater', label: t('capture.movePageLater') }] : []),
      ]
    : [];

  function onAction(event: AccessibilityActionEvent) {
    const offset = event.nativeEvent.actionName === 'moveEarlier' ? -1 : 1;
    onMove?.(offset);
    AccessibilityInfo.announceForAccessibility(t('capture.pageMoved', { number: number + offset }));
  }

  return (
    <View style={styles.container}>
      <View
        accessible
        role="img"
        aria-label={t('capture.pageLabel', { number })}
        accessibilityActions={actions}
        onAccessibilityAction={onAction}
        style={styles.page}>
        <Image source={{ uri }} contentFit="cover" style={styles.image} />
      </View>
      <Pressable
        role="button"
        aria-label={t('capture.removePage', { number })}
        aria-disabled={!onRemove || undefined}
        disabled={!onRemove}
        onPress={onRemove}
        // The visible circle is small so it doesn't hide the page; the touch area is 44 pt.
        hitSlop={(MinTouchTarget - REMOVE_SIZE) / 2}
        style={styles.remove}>
        <ThemedView
          type="backgroundElement"
          style={[
            styles.circle,
            { borderColor: theme.textSecondary },
            !onRemove && styles.disabled,
          ]}>
          <SymbolView
            name={{ ios: 'xmark', android: 'close', web: 'close' }}
            size={16}
            tintColor={theme.text}
          />
        </ThemedView>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
  },
  page: {
    flex: 1,
  },
  image: {
    flex: 1,
    borderRadius: Spacing.two,
  },
  remove: {
    position: 'absolute',
    top: Spacing.one,
    right: Spacing.one,
  },
  circle: {
    width: REMOVE_SIZE,
    height: REMOVE_SIZE,
    borderRadius: REMOVE_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.4,
  },
});
