import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ArchivedNoticeProps = {
  /** «This case is archived», «This document is archived». */
  title: string;
  /** What being archived means for it. */
  hint: string;
  busy: boolean;
  onRestore: () => void;
};

/**
 * Under the name of an archived case or document: says so with an icon, what it means, and
 * «Restore from archive» (CASE-6, HOME-6).
 */
export function ArchivedNotice({ title, hint, busy, onRestore }: ArchivedNoticeProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <ThemedView type="backgroundElement" style={styles.notice}>
      <View style={styles.title}>
        <SymbolView
          name={{ ios: 'archivebox', android: 'inventory_2', web: 'inventory_2' }}
          size={20}
          tintColor={theme.text}
        />
        <ThemedText type="smallBold" role="heading" style={styles.titleText}>
          {title}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {hint}
      </ThemedText>
      <Button
        label={t('archive.restore')}
        variant="secondary"
        disabled={busy}
        onPress={onRestore}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  notice: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  titleText: {
    flexShrink: 1,
  },
});
