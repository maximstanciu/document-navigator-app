import { Colors, type ThemeColor } from './theme';

// WCAG 2.x contrast ratio. AA for body text is 4.5:1 (AGENTS.md: new color tokens need AA in both themes).
function channel(value: number) {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  const n = Number.parseInt(hex.slice(1), 16);
  return (
    0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  );
}

function contrast(foreground: string, background: string) {
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
  return (lighter + 0.05) / (darker + 0.05);
}

const RISK_TOKENS = ['riskHigh', 'riskMedium', 'riskLow', 'fraudWarning'] as const;

const PAIRS: [ThemeColor, ThemeColor][] = [
  ['text', 'background'],
  ['text', 'backgroundElement'],
  ['textSecondary', 'background'],
  ['textSecondary', 'backgroundElement'],
  ['tint', 'background'],
  ['tint', 'backgroundElement'],
  ['onTint', 'tint'],
  ...RISK_TOKENS.flatMap((token): [ThemeColor, ThemeColor][] => [
    [token, `${token}Background`],
    [token, 'background'],
    [token, 'backgroundElement'],
    ['text', `${token}Background`],
    ['textSecondary', `${token}Background`],
  ]),
];

describe.each(['light', 'dark'] as const)('%s theme contrast', (scheme) => {
  const theme = Colors[scheme];

  it.each(PAIRS)('%s on %s meets AA (4.5:1)', (foreground, background) => {
    expect(contrast(theme[foreground], theme[background])).toBeGreaterThanOrEqual(4.5);
  });
});

it('defines the same tokens in both themes', () => {
  expect(Object.keys(Colors.dark).sort()).toEqual(Object.keys(Colors.light).sort());
});
