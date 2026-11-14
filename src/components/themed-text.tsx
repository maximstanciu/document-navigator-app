import { StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  /**
   * `label`: a small mono caps label, for section headings and dates. `lead`: the larger body text
   * that opens a screen («In short»). `display`: the big countdown on the inverse card.
   */
  type?:
    | 'default'
    | 'title'
    | 'small'
    | 'smallBold'
    | 'subtitle'
    | 'link'
    | 'linkPrimary'
    | 'code'
    | 'label'
    | 'lead'
    | 'display';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'tint' : 'text')];
  return <Text style={[{ color }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  small: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 400,
  },
  smallBold: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 600,
  },
  default: {
    fontFamily: Fonts.sans,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 400,
  },
  lead: {
    fontFamily: Fonts.sans,
    fontSize: 19,
    lineHeight: 27,
    fontWeight: 500,
    letterSpacing: -0.2,
  },
  title: {
    fontFamily: Fonts.sans,
    fontSize: 48,
    lineHeight: 52,
    fontWeight: 700,
    letterSpacing: -1.6,
  },
  subtitle: {
    fontFamily: Fonts.sans,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: 700,
    letterSpacing: -1.1,
  },
  display: {
    fontFamily: Fonts.sans,
    fontSize: 88,
    lineHeight: 88,
    fontWeight: 700,
    letterSpacing: -4,
  },
  link: {
    fontFamily: Fonts.sans,
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    fontFamily: Fonts.sans,
    lineHeight: 30,
    fontSize: 14,
    fontWeight: 600,
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: 500,
    fontSize: 12,
  },
  label: {
    fontFamily: Fonts.mono,
    fontWeight: 500,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});
