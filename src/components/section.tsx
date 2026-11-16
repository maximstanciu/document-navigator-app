import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

type SectionProps = PropsWithChildren<{
  title: string;
  /** Space between the heading and the items under it. */
  gap?: number;
}>;

/**
 * A block of a screen under its heading: «In short» on the document screen, «Language» in
 * settings. The heading is one for screen readers too.
 */
export function Section({ title, gap = Spacing.two, children }: SectionProps) {
  return (
    <View style={{ gap }}>
      <ThemedText type="label" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}
