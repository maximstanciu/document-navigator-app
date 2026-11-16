import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth } from '@/constants/theme';

/**
 * The frame of a tab screen: the theme background edge to edge, the content in a centred column
 * clear of the status bar and the notch. The bottom is the content's: it pads itself with
 * `useBottomTabInset()` to scroll clear of the floating tab bar.
 */
export function TabScreen({ children }: PropsWithChildren) {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        {children}
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
});
