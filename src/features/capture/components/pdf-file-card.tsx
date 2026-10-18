import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatFileSize } from '@/lib/i18n/format';

type PdfFileCardProps = {
  name: string | null;
  /** Bytes, when known. */
  size: number | null;
};

/**
 * A PDF waiting for review. The client can't render PDF pages (D-4), so it shows an icon, the file
 * name and the size instead of thumbnails (CAP-5).
 */
export function PdfFileCard({ name, size }: PdfFileCardProps) {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const formattedSize = size === null ? null : formatFileSize(size, i18n.language);

  return (
    // One stop for screen readers: the name and the size are read together.
    <ThemedView type="backgroundElement" style={styles.card} accessible>
      <SymbolView
        name={{ ios: 'doc.text', android: 'picture_as_pdf', web: 'picture_as_pdf' }}
        size={40}
        tintColor={theme.tint}
      />
      <View style={styles.text}>
        <ThemedText type="smallBold" numberOfLines={3}>
          {name ?? t('documents.kind.pdf')}
        </ThemedText>
        {formattedSize && (
          <ThemedText type="small" themeColor="textSecondary">
            {t(`fileSize.${formattedSize.unit}`, { value: formattedSize.value })}
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
