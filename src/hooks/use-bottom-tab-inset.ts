import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing, TabBarHeight } from '@/constants/theme';

/**
 * How far the floating tab bar sits above the bottom edge: clear of the home indicator or the
 * Android navigation bar, and never closer than the design's 24.
 */
export function tabBarBottom(safeAreaBottom: number): number {
  return Math.max(safeAreaBottom, Spacing.four);
}

/** Space a tab screen leaves under its content, so the last item scrolls clear of the tab bar. */
export function useBottomTabInset(): number {
  const { bottom } = useSafeAreaInsets();
  return tabBarBottom(bottom) + TabBarHeight + Spacing.three;
}
