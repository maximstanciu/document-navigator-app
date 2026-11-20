import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Pressable, StyleSheet } from 'react-native';

import { MinTouchTarget, PressedOpacity, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type HeaderIconButtonProps = {
  /** The accessible name: the icon alone says nothing to a screen reader. */
  label: string;
  icon: SymbolViewProps['name'];
  onPress: () => void;
};

/** An icon button in a screen's header, tinted, with a full touch target. */
export function HeaderIconButton({ label, icon, onPress }: HeaderIconButtonProps) {
  const theme = useTheme();

  return (
    <Pressable
      role="button"
      aria-label={label}
      hitSlop={Spacing.two}
      onPress={onPress}
      style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}>
      <SymbolView name={icon} size={24} tintColor={theme.tint} />
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
    opacity: PressedOpacity,
  },
});
