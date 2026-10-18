import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type SourceOptionProps = {
  icon: SymbolViewProps['name'];
  label: string;
  hint: string;
  /** Without a handler the option is shown disabled. */
  onPress?: () => void;
};

/** One way to add a document on the capture screen: icon, name and a one-line explanation. */
export function SourceOption({ icon, label, hint, onPress }: SourceOptionProps) {
  const theme = useTheme();
  const disabled = !onPress;

  return (
    <Pressable
      role="button"
      aria-label={label}
      accessibilityHint={hint}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onPress={onPress}>
      {({ pressed }) => (
        <ThemedView
          type={pressed ? 'backgroundSelected' : 'backgroundElement'}
          style={[styles.row, disabled && styles.disabled]}>
          <SymbolView name={icon} size={28} tintColor={theme.tint} />
          <View style={styles.text}>
            <ThemedText type="smallBold">{label}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {hint}
            </ThemedText>
          </View>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
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
  disabled: {
    opacity: 0.4,
  },
});
