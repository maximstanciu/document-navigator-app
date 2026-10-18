import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { TypeFilter } from '../type-filter';

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = selected ? theme.onTint : theme.text;

  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? theme.tint : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      {/* The check, not only the fill, tells the chosen chip. */}
      {selected && (
        <SymbolView
          name={{ ios: 'checkmark', android: 'check', web: 'check' }}
          size={16}
          tintColor={color}
        />
      )}
      <ThemedText type="smallBold" style={{ color }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

type TypeFilterBarProps = {
  types: readonly TypeFilter[];
  /** `null` — all types. */
  selected: TypeFilter | null;
  onSelect: (type: TypeFilter | null) => void;
};

/** The filter by document type (HOME-4): «All» and each type the documents have. */
export function TypeFilterBar({ types, selected, onSelect }: TypeFilterBarProps) {
  const { t } = useTranslation();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      role="radiogroup"
      aria-label={t('documents.filter.label')}
      contentContainerStyle={styles.row}>
      <Chip
        label={t('documents.filter.all')}
        selected={selected === null}
        onPress={() => onSelect(null)}
      />
      {types.map((type) => (
        <Chip
          key={type}
          label={t(`documents.documentType.${type}`)}
          selected={selected === type}
          onPress={() => onSelect(type)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.two,
  },
  chip: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    borderRadius: MinTouchTarget / 2,
  },
  pressed: {
    opacity: 0.7,
  },
});
