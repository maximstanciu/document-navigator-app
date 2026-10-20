import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import { useDeleteAllData } from '../queries';

/**
 * «Delete all data» (SET-3, STO-7), asked again in place before anything is deleted. Says when it is
 * done, since the screen around it barely changes.
 */
export function DeleteAllData() {
  const theme = useTheme();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const deleteAll = useDeleteAllData();

  if (confirming) {
    return (
      <View style={[styles.confirmation, { borderColor: theme.border }]}>
        <ThemedText type="smallBold" role="heading">
          {t('settings.deleteAll.title')}
        </ThemedText>
        <ThemedText type="small">{t('settings.deleteAll.message')}</ThemedText>
        <Button
          label={t('settings.deleteAll.confirm')}
          variant="destructive"
          onPress={() => {
            setConfirming(false);
            deleteAll.mutate();
          }}
        />
        <Button
          label={t('common.cancel')}
          variant="secondary"
          onPress={() => setConfirming(false)}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Button
        label={t('settings.deleteAll.button')}
        variant="destructive"
        disabled={deleteAll.isPending}
        onPress={() => {
          deleteAll.reset();
          setConfirming(true);
        }}
      />
      {deleteAll.isPending && (
        <ActivityIndicator color={theme.textSecondary} aria-label={t('common.loading')} />
      )}
      {deleteAll.isSuccess && (
        <ThemedText type="small" aria-live="polite">
          {t('settings.deleteAll.done')}
        </ThemedText>
      )}
      {deleteAll.isError && (
        <ThemedText type="small" role="alert">
          {t('settings.deleteAll.failed')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
  },
  confirmation: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
