import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DisabledOpacity, MinTouchTarget, PressedOpacity, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type CheckboxProps = Omit<PressableProps, 'children' | 'style' | 'role' | 'onPress'> & {
  /** Visible text and accessible name. */
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

/** The mark of a checkbox: a ticked or an empty square, so a choice never shows by color alone. */
export function CheckboxMark({ checked }: { checked: boolean }) {
  const theme = useTheme();
  return (
    <SymbolView
      name={
        checked
          ? { ios: 'checkmark.square.fill', android: 'check_box', web: 'check_box' }
          : { ios: 'square', android: 'check_box_outline_blank', web: 'check_box_outline_blank' }
      }
      size={24}
      tintColor={checked ? theme.tint : theme.textSecondary}
    />
  );
}

/** A labelled checkbox; a checked item reads as done (struck through, secondary color). */
export function Checkbox({ label, checked, onChange, disabled, ...rest }: CheckboxProps) {
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
      <CheckboxMark checked={checked} />
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
    opacity: PressedOpacity,
  },
  disabled: {
    opacity: DisabledOpacity,
  },
});
