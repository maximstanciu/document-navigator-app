import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SearchFieldProps = {
  value: string;
  onChangeText: (text: string) => void;
};

/** The search over the documents (HOME-3), with a button that clears it. */
export function SearchField({ value, onChangeText }: SearchFieldProps) {
  const theme = useTheme();
  const { t } = useTranslation();

  return (
    <ThemedView type="backgroundElement" style={styles.field}>
      <SymbolView
        name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
        size={20}
        tintColor={theme.textSecondary}
      />
      <TextInput
        role="searchbox"
        aria-label={t('documents.search.label')}
        placeholder={t('documents.search.placeholder')}
        placeholderTextColor={theme.textSecondary}
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
        enterKeyHint="search"
        style={[styles.input, { color: theme.text }]}
      />
      {value !== '' && (
        <Pressable
          role="button"
          aria-label={t('documents.search.clear')}
          hitSlop={Spacing.two}
          onPress={() => onChangeText('')}
          style={({ pressed }) => [styles.clear, pressed && styles.pressed]}>
          <SymbolView
            name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
            size={20}
            tintColor={theme.textSecondary}
          />
        </Pressable>
      )}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  field: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingLeft: Spacing.three,
    borderRadius: Spacing.three,
  },
  input: {
    flex: 1,
    minHeight: MinTouchTarget,
    fontSize: 16,
    paddingVertical: Spacing.two,
  },
  clear: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
