import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';

import { formatPageCount, formatUpdatedAt } from '../format';
import type { DocumentSummary } from '../types';

export function DocumentListItem({ document }: { document: DocumentSummary }) {
  const meta = `${formatUpdatedAt(document.updatedAt)} · ${formatPageCount(document.pageCount)}`;

  return (
    <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
      <Pressable role="link" aria-label={`${document.title}, ${meta}`}>
        {({ pressed }) => (
          <ThemedView
            type={pressed ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.row}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {document.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {meta}
            </ThemedText>
          </ThemedView>
        )}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: MinTouchTarget,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.one,
  },
});
