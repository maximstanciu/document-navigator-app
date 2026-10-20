import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';

type ChoiceRowProps = {
  /** `radio`: one of a few; `checkbox`: any of a few. */
  role: 'radio' | 'checkbox';
  label: string;
  /** The accessible name if it has to say more than the label; it starts with or contains it. */
  name?: string;
  checked: boolean;
  disabled?: boolean;
  onPress: () => void;
};

/** A row in a list of choices, checked with a mark and a highlight (SET-1, SET-2). */
export function ChoiceRow({ role, label, name, checked, disabled, onPress }: ChoiceRowProps) {
  return (
    <Pressable
      role={role}
      aria-label={name ?? label}
      aria-checked={checked}
      aria-disabled={disabled ?? undefined}
      disabled={disabled}
      onPress={onPress}>
      {({ pressed }) => (
        <ThemedView
          type={checked || pressed ? 'backgroundSelected' : 'backgroundElement'}
          style={styles.row}>
          <ThemedText type="small" style={styles.label}>
            {label}
          </ThemedText>
          <ThemedText type="smallBold" aria-hidden>
            {checked ? '✓' : ''}
          </ThemedText>
        </ThemedView>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.three,
  },
  label: {
    flex: 1,
  },
});
