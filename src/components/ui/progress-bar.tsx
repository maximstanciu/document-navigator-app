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

export type ProgressBarProps = Omit<ViewProps, 'children'> & {
  /** The share done, from 0 to 1; `null` or left out while it isn't known. */
  value?: number | null;
};

/**
 * A progress bar. With `value`, the track fills to that share, and a new value slides there. Without
 * it, for work whose share done isn't known, a segment runs along the track; with reduced motion
 * on, the whole bar slowly fades in and out in place instead, and a new value jumps there.
 */
export function ProgressBar({ value = null, style, ...rest }: ProgressBarProps) {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  const share = value === null ? null : Math.min(1, Math.max(0, value));
  const accessibilityValue =
    share === null
      ? {}
      : { 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(share * 100) };

  return (
    <View
      accessible
      role="progressbar"
      aria-busy
      {...accessibilityValue}
      style={[styles.track, { backgroundColor: theme.border }, style]}
      {...rest}>
      {share === null ? (
        <Animated.View
          key="unknown"
          style={[
            styles.indicator,
            { backgroundColor: theme.tint },
            reducedMotion ? animations.pulse : animations.slide,
          ]}
        />
      ) : (
        // Its own key: switching from the running segment doesn't slide the width from 40%.
        <Animated.View
          key="known"
          style={[
            styles.indicator,
            { backgroundColor: theme.tint, width: `${share * 100}%` },
            !reducedMotion && animations.fill,
          ]}
        />
      )}
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
  fill: {
    transitionProperty: 'width',
    transitionDuration: '0.6s',
    transitionTimingFunction: 'ease-out',
  },
});
