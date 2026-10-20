import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /**
   * `plain`: tinted text without a fill, as wide as its label, for actions inside a card.
   * `destructive`: a deleting action, in the high-risk color on the card background.
   */
  variant?: 'primary' | 'secondary' | 'plain' | 'destructive';
};

export function Button({ label, variant = 'primary', disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.tint,
    secondary: theme.backgroundElement,
    plain: 'transparent',
    destructive: theme.backgroundElement,
  }[variant];
  const color = {
    primary: theme.onTint,
    secondary: theme.text,
    plain: theme.tint,
    destructive: theme.riskHigh,
  }[variant];

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
      {/* A plain label stays on one line: on Android a label that exactly fills its shrink-wrapped
          width could still wrap its last word out of sight («Add to calendar» on the document
          screen, task 5.5). Plain labels are short; a longer one ends in «…» instead of losing a
          word unseen. */}
      <ThemedText
        type="smallBold"
        style={{ color }}
        numberOfLines={variant === 'plain' ? 1 : undefined}>
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
