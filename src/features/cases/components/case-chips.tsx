import { Link, router } from 'expo-router';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, View, type PressableProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, PressedOpacity, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { CaseSummary } from '../types';

const FOLDER: SymbolViewProps['name'] = { ios: 'folder', android: 'folder', web: 'folder' };
const NEW_FOLDER: SymbolViewProps['name'] = {
  ios: 'folder.badge.plus',
  android: 'create_new_folder',
  web: 'create_new_folder',
};
const ARCHIVE: SymbolViewProps['name'] = {
  ios: 'archivebox',
  android: 'inventory_2',
  web: 'inventory_2',
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
  /** The cases that aren't archived, newest first. */
  cases: readonly CaseSummary[];
  /** How many documents each case has, by its id. */
  counts: ReadonlyMap<string, number>;
  /** How many cases are in the archive (CASE-6). */
  archivedCases: number;
  /** How many documents are in the archive themselves (HOME-6). */
  archivedDocuments: number;
};

/**
 * «Cases» on the Documents tab (CASE-3): a chip per case with its number of documents, newest case
 * first, each opening the case; then «New case», and «Archive» while it holds cases or documents
 * (CASE-6, HOME-6).
 */
export function CaseChips({ cases, counts, archivedCases, archivedDocuments }: CaseChipsProps) {
  const { t } = useTranslation();
  const archived = archivedCases + archivedDocuments;
  // «Archive: 1 case, 2 documents».
  const archiveContents = [
    archivedCases > 0 && t('archive.cases', { count: archivedCases }),
    archivedDocuments > 0 && t('cases.documents', { count: archivedDocuments }),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={styles.section}>
      <ThemedText type="label" role="heading" themeColor="textSecondary">
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
        {archived > 0 && (
          <Link href="/archive" asChild>
            <Chip
              role="link"
              icon={ARCHIVE}
              label={t('archive.title')}
              detail={String(archived)}
              accessibleLabel={t('archive.chipLabel', { contents: archiveContents })}
            />
          </Link>
        )}
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
    borderRadius: Radius.card,
  },
  label: {
    flexShrink: 1,
  },
  pressed: {
    opacity: PressedOpacity,
  },
});
