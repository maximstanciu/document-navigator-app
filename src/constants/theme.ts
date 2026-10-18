/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
    tint: '#0966CA',
    onTint: '#ffffff',
    danger: '#D93036',
    border: '#D9D9E0',
    // Risk levels and the fraud warning (DET-5, DET-10). Always paired with text and an icon:
    // color alone never carries the meaning (§8.4). Contrast is checked in theme.test.ts.
    riskHigh: '#B42318',
    riskHighBackground: '#FEE4E2',
    riskMedium: '#93370D',
    riskMediumBackground: '#FEF0C7',
    riskLow: '#1849A9',
    riskLowBackground: '#E0EAFF',
    fraudWarning: '#9F1239',
    fraudWarningBackground: '#FFE4E6',
  },
  dark: {
    text: '#ffffff',
    background: '#000000',
    backgroundElement: '#212225',
    backgroundSelected: '#2E3135',
    textSecondary: '#B0B4BA',
    tint: '#3C9FFE',
    onTint: '#000000',
    danger: '#FF6369',
    border: '#3A3F42',
    riskHigh: '#FDA29B',
    riskHighBackground: '#55160C',
    riskMedium: '#FEC84B',
    riskMediumBackground: '#4E1D09',
    riskLow: '#84ADFF',
    riskLowBackground: '#102A56',
    fraudWarning: '#FDA4AF',
    fraudWarningBackground: '#4C0519',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
/** Web renders the tab bar as a floating header (see `app-tabs.web.tsx`). */
export const TopTabInset = Platform.select({ web: Spacing.six + Spacing.three }) ?? 0;
/** Minimum touch target size (Apple HIG 44pt, Material 48dp). */
export const MinTouchTarget = 44;
export const MaxContentWidth = 800;
