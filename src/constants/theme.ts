/**
 * The app's colors in light and dark mode, its type families, spacing and radii. The look: ink on a
 * cool grey ground with white cards, and one lime accent. In the light theme the lime never sits on
 * a light surface: it shows only on ink (the accent of `tint` fills and of the inverse card).
 */

import '@/global.css';

import { Platform } from 'react-native';

const Ink = '#0B0D12';
const Lime = '#C8F31D';

export const Colors = {
  light: {
    text: Ink,
    background: '#F4F5F7',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#E3E5EA',
    textSecondary: '#555B66',
    // Fills (primary buttons, chosen chips, checkboxes) and tappable text: ink, with lime on it.
    tint: Ink,
    onTint: Lime,
    danger: '#C62A30',
    border: '#D9DCE1',
    // Dims the screen behind a sheet; never a text color.
    scrim: '#00000066',
    // The card that leads a screen (the nearest deadline, HOME-1): ink in light, lime in dark.
    inverse: Ink,
    onInverse: '#FFFFFF',
    onInverseSecondary: '#A4A9B3',
    // A button on the inverse card.
    inverseAction: Lime,
    onInverseAction: Ink,
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
    tabBar: '#FFFFFF',
    tabBarBorder: '#FFFFFF',
    tabBarShadow: '#0B0D121F',
  },
  dark: {
    text: '#F5F6F8',
    background: '#0A0B0E',
    backgroundElement: '#15171C',
    backgroundSelected: '#252830',
    textSecondary: '#A4A9B3',
    tint: Lime,
    onTint: Ink,
    danger: '#FF6369',
    border: '#2B2F37',
    scrim: '#000000A6',
    inverse: Lime,
    onInverse: Ink,
    onInverseSecondary: '#3A4708',
    inverseAction: Ink,
    onInverseAction: Lime,
    riskHigh: '#FDA29B',
    riskHighBackground: '#55160C',
    riskMedium: '#FEC84B',
    riskMediumBackground: '#4E1D09',
    riskLow: '#84ADFF',
    riskLowBackground: '#102A56',
    fraudWarning: '#FDA4AF',
    fraudWarningBackground: '#4C0519',
    tabBar: '#1E2128',
    tabBarBorder: '#2B2F37',
    tabBarShadow: '#00000000',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * Onest for text, JetBrains Mono for dates, amounts and section labels. Embedded in the native
 * build by the `expo-font` plugin (app.json) and loaded with `useAppFonts` on web. iOS names a
 * family by the font file; on Android and web the name is the one given in app.json and
 * `src/lib/fonts.web.ts`.
 */
export const Fonts = {
  sans: 'Onest',
  mono: Platform.select({ ios: 'JetBrains Mono', default: 'JetBrainsMono' }),
} as const;

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/** Corner radii: cards, the inverse card, small tiles and fully round pills. */
export const Radius = {
  tile: 14,
  card: 22,
  hero: 28,
  pill: 999,
} as const;

/**
 * The floating tab bar (`src/components/app-tabs.tsx`): its height and its widest, on a tablet or
 * the web preview. Tab screens leave room for it with `useBottomTabInset()`.
 */
export const TabBarHeight = 68;
export const TabBarMaxWidth = 480;
/** Minimum touch target size (Apple HIG 44pt, Material 48dp). */
export const MinTouchTarget = 44;
export const MaxContentWidth = 800;
