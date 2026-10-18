import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

/** A block of the document screen under its heading («In short», «What to do»…). */
export function DetailSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" role="heading" themeColor="textSecondary">
        {title}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
});
