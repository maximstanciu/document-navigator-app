import { router, Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { NameForm } from '@/components/ui/name-form';
import { ContentColumn, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useCreateCase } from '../queries';
import { MAX_CASE_NAME_LENGTH } from '../types';

// Opened by a direct URL (web preview), the screen has nothing to go back to.
const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));

/**
 * «New case» (CASE-1), a modal with the name at the top, clear of the keyboard. The new case opens
 * in its place. Started from a document's screen (`documentId`), the document is filed in it and
 * the modal goes back to the document (CASE-2); started from the row of a document related to it
 * (`withDocumentId`), both are filed, in one transaction (LINK-4).
 */
export function NewCaseScreen({
  documentId,
  withDocumentId,
}: {
  documentId?: string;
  withDocumentId?: string;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const create = useCreateCase();

  const save = (name: string) =>
    create.mutate(
      {
        name,
        documentIds: documentId ? [documentId, ...(withDocumentId ? [withDocumentId] : [])] : [],
      },
      {
        onSuccess: (id) => {
          if (documentId) leave();
          else router.replace({ pathname: '/cases/[id]', params: { id } });
        },
      }
    );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: t('cases.newCase') }} />
      <ThemedText type="small" themeColor="textSecondary">
        {t('cases.newCaseHint')}
      </ThemedText>
      <NameForm
        name=""
        label={t('cases.nameLabel')}
        placeholder={t('cases.namePlaceholder')}
        maxLength={MAX_CASE_NAME_LENGTH}
        saveLabel={t('cases.create')}
        busy={create.isPending}
        onSave={save}
        onCancel={leave}
      />
      {create.isError && (
        <ThemedText type="small" role="alert">
          {t('cases.createFailed')}
        </ThemedText>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    padding: Spacing.four,
    ...ContentColumn,
  },
});
