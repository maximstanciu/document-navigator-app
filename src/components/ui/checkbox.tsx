import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CheckboxProps = Omit<PressableProps, 'children' | 'style' | 'role' | 'onPress'> & {
  /** Visible text and accessible name. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** A labelled checkbox; a checked item reads as done (struck through, secondary color). */
export function Checkbox({ label, checked, onChange, disabled, ...rest }: CheckboxProps) {
  const theme = useTheme();

  return (
    <Pressable
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      aria-disabled={disabled ?? undefined}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      style={({ pressed }) => [styles.row, pressed && styles.pressed, disabled && styles.disabled]}
      {...rest}>
      <SymbolView
        name={
          checked
            ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' }
            : {
                ios: 'square',
                android: 'check_box_outline_blank',
                web: 'check_box_outline_blank',
              }
        }
        size={24}
        tintColor={checked ? theme.tint : theme.textSecondary}
      />
      <ThemedText
        type="small"
        themeColor={checked ? 'textSecondary' : 'text'}
        style={[styles.label, checked && styles.checkedLabel]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  checkedLabel: {
    textDecorationLine: 'line-through',
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
