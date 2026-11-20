import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatTimestampDate } from '@/lib/i18n/format';

import type { CaseSummary } from '../types';

type ArchivedCaseRowProps = {
  item: CaseSummary;
  /** How many documents are filed in it. */
  documentCount: number;
};

/**
 * An archived case on the Archive screen (CASE-6): its name, number of documents and since when it
 * is archived. Opens the case's screen, where it can be restored.
 */
export function ArchivedCaseRow({ item, documentCount }: ArchivedCaseRowProps) {
  const theme = useTheme();
  const { t, i18n } = useTranslation();
  const documents = t('cases.documents', { count: documentCount });
  const since = item.archivedAt
    ? t('archive.since', { date: formatTimestampDate(item.archivedAt, i18n.language) })
    : null;
  const detail = [documents, since].filter(Boolean).join(' · ');

  return (
    <Link href={{ pathname: '/cases/[id]', params: { id: item.id } }} asChild>
      <Pressable role="link" aria-label={`${item.name}, ${detail}`}>
        {({ pressed }) => (
          <ThemedView
            type={pressed ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.row}>
            <SymbolView
              name={{ ios: 'folder', android: 'folder', web: 'folder' }}
              size={22}
              tintColor={theme.textSecondary}
            />
            <View style={styles.text}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {item.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {detail}
              </ThemedText>
            </View>
          </ThemedView>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
  },
  text: {
    flex: 1,
    gap: Spacing.half,
  },
});
