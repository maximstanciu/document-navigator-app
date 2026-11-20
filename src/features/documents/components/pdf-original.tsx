import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { PdfFileCard } from '@/features/capture/components/pdf-file-card';

import type { OriginalFile } from '../original-file';
import { useOriginalFile } from '../use-original-file';

/**
 * A PDF original (D-4): the app can't draw its pages, so a file card, «Open» in the system viewer
 * and «Share» to save or send it (DET-7).
 */
export function PdfOriginal({ file, size }: { file: OriginalFile; size: number | null }) {
  const { t } = useTranslation();
  const actions = useOriginalFile();

  return (
    <View style={styles.container}>
      <PdfFileCard name={null} size={size} />
      <View style={styles.buttons}>
        <View style={styles.button}>
          <Button
            label={t('documents.original.open')}
            aria-label={t('documents.original.openPdf')}
            onPress={() => actions.open(file)}
          />
        </View>
        <View style={styles.button}>
          <Button
            label={t('documents.original.share')}
            aria-label={t('documents.original.sharePdf')}
            variant="secondary"
            onPress={() => actions.share(file)}
          />
        </View>
      </View>
      {actions.failed && (
        <ThemedText type="small" role="alert">
          {t('documents.original.openFailed')}
        </ThemedText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.three,
  },
  buttons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  button: {
    flex: 1,
  },
});
