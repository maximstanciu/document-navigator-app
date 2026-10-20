import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

import { ChoiceRow } from './choice-row';

type RadioGroupProps<T extends string> = {
  label: string;
  /** Shown under the label: what the choice changes. */
  hint?: string;
  /** `name`: the accessible name when the label alone is ambiguous on the screen (default: label). */
  options: readonly { value: T; label: string; name?: string }[];
  selected: T;
  disabled?: boolean;
  onSelect: (value: T) => void;
};

/** One choice out of a few, under its label (SET-1). */
export function RadioGroup<T extends string>({
  label,
  hint,
  options,
  selected,
  disabled,
  onSelect,
}: RadioGroupProps<T>) {
  return (
    <View style={styles.group} role="radiogroup" aria-label={label}>
      <ThemedText type="smallBold">{label}</ThemedText>
      {hint && (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      )}
      {options.map((option) => (
        <ChoiceRow
          key={option.value}
          role="radio"
          label={option.label}
          name={option.name}
          checked={option.value === selected}
          disabled={disabled}
          onPress={() => onSelect(option.value)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: Spacing.two,
  },
});
