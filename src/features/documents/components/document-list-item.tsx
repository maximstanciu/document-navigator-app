import { Link } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MinTouchTarget, Spacing } from '@/constants/theme';

import { displayTitle, formatMeta } from '../format';
import type { DocumentSummary } from '../types';

export function DocumentListItem({ document }: { document: DocumentSummary }) {
  const title = displayTitle(document.title);
  const meta = formatMeta(document);

  return (
    <Link href={{ pathname: '/documents/[id]', params: { id: document.id } }} asChild>
      <Pressable
        role="link"
        aria-label={[title, document.senderName, meta].filter(Boolean).join(', ')}>
        {({ pressed }) => (
          <ThemedView
            type={pressed ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.row}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {title}
            </ThemedText>
            {document.senderName && (
              <ThemedText type="small" numberOfLines={1}>
                {document.senderName}
              </ThemedText>
            )}
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
