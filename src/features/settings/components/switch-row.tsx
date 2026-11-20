import { StyleSheet, Switch, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { DisabledOpacity, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** A setting turned on and off, with what it does under it. */
export function SwitchRow({
  label,
  hint,
  value,
  disabled,
  onValueChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled: boolean;
  onValueChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.group}>
      <View style={styles.row}>
        <ThemedText type="smallBold" style={styles.text}>
          {label}
        </ThemedText>
        <Switch
          // Not `aria-label`: Switch hands its props to the native view as they are, and only View
          // turns `aria-*` into what Android reads out (task 5.6: TalkBack found no name).
          accessibilityLabel={label}
          // Also what tests and the iOS bridge read; Android derives it from `disabled` anyway.
          accessibilityState={{ disabled }}
          value={value}
          disabled={disabled}
          // The track off is as visible as on, in both themes (the web default nearly vanishes);
          // the thumb is the theme's, not the platform's accent, except on iOS, which keeps its own.
          trackColor={{ false: theme.textSecondary, true: theme.tint }}
          ios_backgroundColor={theme.textSecondary}
          thumbColor={process.env.EXPO_OS === 'ios' ? undefined : theme.onTint}
          // With its own colors Android no longer dims a disabled switch; iOS still does.
          style={disabled && process.env.EXPO_OS !== 'ios' ? styles.disabled : undefined}
          onValueChange={onValueChange}
        />
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {hint}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  text: {
    flex: 1,
  },
  disabled: {
    opacity: DisabledOpacity,
  },
});
