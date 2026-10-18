import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** «+» on the documents screen: opens the choice of source for a new document (CAP-1). */
export function AddDocumentButton() {
  const { t } = useTranslation();
  const theme = useTheme();

  return (
    <Pressable
      role="button"
      aria-label={t('documents.addDocument')}
      hitSlop={Spacing.two}
      onPress={() => router.push('/capture')}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: theme.tint },
        pressed && styles.pressed,
      ]}>
      <SymbolView
        name={{ ios: 'plus', android: 'add', web: 'add' }}
        size={20}
        tintColor={theme.onTint}
      />
      <ThemedText type="smallBold" style={{ color: theme.onTint }}>
        {t('documents.add')}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.four,
    borderRadius: MinTouchTarget / 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
