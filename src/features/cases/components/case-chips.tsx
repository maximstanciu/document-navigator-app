import { Link, router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { CaseSummary } from '../types';

const FOLDER: SymbolViewProps['name'] = { ios: 'folder', android: 'folder', web: 'folder' };
const NEW_FOLDER: SymbolViewProps['name'] = {
  ios: 'folder.badge.plus',
  android: 'create_new_folder',
  web: 'create_new_folder',
};

type ChipProps = Omit<PressableProps, 'children' | 'style'> & {
  role: 'link' | 'button';
  icon: SymbolViewProps['name'];
  label: string;
  detail?: string;
  accessibleLabel: string;
};

/** A case's chip is rendered inside `Link asChild`, which passes the press handler down. */
function Chip({ role, icon, label, detail, accessibleLabel, ...rest }: ChipProps) {
  const theme = useTheme();

  return (
    <Pressable
      role={role}
      aria-label={accessibleLabel}
      {...rest}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <SymbolView name={icon} size={18} tintColor={theme.tint} />
      <ThemedText type="smallBold" numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
      {detail && (
        <ThemedText type="small" themeColor="textSecondary">
          {detail}
        </ThemedText>
      )}
    </Pressable>
  );
}

type CaseChipsProps = {
  cases: readonly CaseSummary[];
  /** How many documents each case has, by its id. */
  counts: ReadonlyMap<string, number>;
};

/**
 * «Cases» on the Documents tab (CASE-3): a chip per case with its number of documents, newest case
 * first, each opening the case; then «New case».
 */
export function CaseChips({ cases, counts }: CaseChipsProps) {
  const { t } = useTranslation();

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold" role="heading">
        {t('cases.title')}
      </ThemedText>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        {cases.map((item) => {
          const documents = t('cases.documents', { count: counts.get(item.id) ?? 0 });
          return (
            <Link key={item.id} href={{ pathname: '/cases/[id]', params: { id: item.id } }} asChild>
              <Chip
                role="link"
                icon={FOLDER}
                label={item.name}
                detail={String(counts.get(item.id) ?? 0)}
                accessibleLabel={`${item.name}, ${documents}`}
              />
            </Link>
          );
        })}
        {/* Opens a modal, like «Add»: an action rather than a place. */}
        <Chip
          role="button"
          icon={NEW_FOLDER}
          label={t('cases.newCase')}
          accessibleLabel={t('cases.newCase')}
          onPress={() => router.push('/cases/new')}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  row: {
    gap: Spacing.two,
  },
  chip: {
    minHeight: MinTouchTarget,
    maxWidth: 240,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    borderRadius: Spacing.three,
  },
  label: {
    flexShrink: 1,
  },
  pressed: {
    opacity: 0.7,
  },
});
