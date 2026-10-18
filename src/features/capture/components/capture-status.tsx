import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from '@/shared/limits';

import type { CaptureNotice, CaptureProgress } from '../use-capture-pages';

/** A capture problem, or the draft that couldn't be saved on the review screen. */
export type CaptureStatusNotice = CaptureNotice | 'saveFailed';

function noticeText(notice: CaptureStatusNotice, t: TFunction): string {
  switch (notice) {
    case 'tooManyPages':
    case 'tooManyPhotos':
      return t(`capture.${notice}`, { count: MAX_DOCUMENT_PAGES });
    case 'fileTooLarge':
    case 'pagesTooLarge':
      return t(`capture.${notice}`, { limit: MAX_DOCUMENT_BYTES / (1024 * 1024) });
    default:
      return t(`capture.${notice}`);
  }
}

type CaptureStatusProps = {
  progress: CaptureProgress | null;
  notice: CaptureStatusNotice | null;
};

/** Progress while pages are prepared, otherwise why the last capture added nothing. */
export function CaptureStatus({ progress, notice }: CaptureStatusProps) {
  const { t } = useTranslation();
  const theme = useTheme();

  if (progress) {
    return (
      <ThemedView type="backgroundElement" style={[styles.box, styles.progress]}>
        <ActivityIndicator color={theme.tint} />
        <ThemedText type="small" aria-live="polite">
          {progress.total > 1
            ? t('capture.preparingPagesProgress', progress)
            : t('capture.preparingPages')}
        </ThemedText>
      </ThemedView>
    );
  }
  if (!notice) return null;
  return (
    <ThemedView type="backgroundElement" style={styles.box}>
      <ThemedText type="small" role="alert">
        {noticeText(notice, t)}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  box: {
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
