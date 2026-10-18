import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /** `plain`: tinted text without a fill, as wide as its label, for actions inside a card. */
  variant?: 'primary' | 'secondary' | 'plain';
};

export function Button({ label, variant = 'primary', disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.tint,
    secondary: theme.backgroundElement,
    plain: 'transparent',
  }[variant];
  const color = { primary: theme.onTint, secondary: theme.text, plain: theme.tint }[variant];

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled ?? undefined}
      disabled={disabled}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.base,
        variant === 'plain' && styles.plain,
        { backgroundColor: background },
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
      {...rest}>
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plain: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
  disabled: {
    opacity: 0.4,
  },
});
