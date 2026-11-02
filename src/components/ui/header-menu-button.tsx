import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** «⋯» in a screen's header: opens the actions of what the screen shows. */
export function HeaderMenuButton({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      role="button"
      aria-label={label}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
      <SymbolView
        name={{ ios: 'ellipsis.circle', android: 'more_vert', web: 'more_horiz' }}
        size={24}
        tintColor={theme.tint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: MinTouchTarget,
    minHeight: MinTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
});
