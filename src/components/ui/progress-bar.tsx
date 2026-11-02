import { StyleSheet, View, type ViewProps } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const slide = css.keyframes({
  from: { transform: [{ translateX: '-100%' }] },
  // The segment is 40% of the track, so 250% of its own width takes it past the far end.
  to: { transform: [{ translateX: '250%' }] },
});

const pulse = css.keyframes({
  from: { opacity: 0.35 },
  to: { opacity: 1 },
});

export type ProgressBarProps = Omit<ViewProps, 'children'>;

/**
 * A progress bar for work whose share done isn't known: a segment runs along the track. With
 * reduced motion on, the whole bar slowly fades in and out in place instead.
 */
export function ProgressBar({ style, ...rest }: ProgressBarProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();

  return (
    <View
      accessible
      role="progressbar"
      aria-busy
      style={[styles.track, { backgroundColor: theme.border }, style]}
      {...rest}>
      <Animated.View
        style={[
          styles.indicator,
          { backgroundColor: theme.tint },
          reducedMotion ? animations.pulse : animations.slide,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: Spacing.one,
    borderRadius: Spacing.half,
    overflow: 'hidden',
  },
  indicator: {
    height: '100%',
    borderRadius: Spacing.half,
  },
});

const animations = css.create({
  slide: {
    width: '40%',
    animationName: slide,
    animationDuration: '1.6s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  pulse: {
    width: '100%',
    animationName: pulse,
    animationDuration: '1.2s',
    animationTimingFunction: 'ease-in-out',
    animationDirection: 'alternate',
    animationIterationCount: 'infinite',
  },
});
