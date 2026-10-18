import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const REMOVE_SIZE = 32;

type PageThumbnailProps = {
  uri: string;
  /** 1-based, as people count pages. */
  number: number;
  /** Without a handler the page can't be removed (e.g. while pages are prepared). */
  onRemove?: () => void;
};

/** A page on the review screen with a button to remove it (CAP-5). */
export function PageThumbnail({ uri, number, onRemove }: PageThumbnailProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <Image
        source={{ uri }}
        accessible
        alt={t('capture.pageLabel', { number })}
        contentFit="cover"
        style={styles.image}
      />
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
    width: '31%',
  },
  image: {
    width: '100%',
    // Close to A4, the most common page shape.
    aspectRatio: 0.71,
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
