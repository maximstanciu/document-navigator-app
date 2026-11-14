import { Pressable, StyleSheet, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const HIT_SLOP = { left: Spacing.two, right: Spacing.two };

export type ButtonProps = Omit<PressableProps, 'children' | 'style'> & {
  label: string;
  /**
   * `plain`: tinted text without a fill, as wide as its label, for actions inside a card.
   * `destructive`: a deleting action, in the high-risk color on the card background.
   * `inverse`: a button on the inverse card (the nearest deadline, HOME-1).
   */
  variant?: 'primary' | 'secondary' | 'plain' | 'destructive' | 'inverse';
};

export function Button({ label, variant = 'primary', disabled, ...rest }: ButtonProps) {
  const theme = useTheme();
  const background = {
    primary: theme.tint,
    secondary: theme.backgroundElement,
    plain: 'transparent',
    destructive: theme.backgroundElement,
    inverse: theme.inverseAction,
  }[variant];
  const color = {
    primary: theme.onTint,
    secondary: theme.text,
    plain: theme.tint,
    destructive: theme.riskHigh,
    inverse: theme.onInverseAction,
  }[variant];

  return (
    <Pressable
      role="button"
      aria-label={label}
      aria-disabled={disabled ?? undefined}
      disabled={disabled}
      // Sideways only: `minHeight` already makes it 44 pt tall, and a slop above and below would
      // reach into the next row of a wrapping button row (a deadline's card), where the later
      // button wins the overlap and takes taps meant for the one above it (task 6.2).
      hitSlop={HIT_SLOP}
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
    borderRadius: Radius.pill,
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
