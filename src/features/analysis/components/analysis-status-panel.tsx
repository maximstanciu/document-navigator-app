import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { DocumentRecord } from '@/lib/db/types';
import { formatTimestampDateTime } from '@/lib/i18n/format';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { isRetryable, type AnalysisError, type AnalysisErrorCode } from '../errors';
import {
  useAnalyzeDocument,
  useCancelAnalysis,
  useIsUploading,
  useJobProgress,
  useLastAnalysisError,
} from '../queries';

/** The text for a failed analysis (ANL-9). `lastError` adds when a `429` lets the person retry. */
function failureMessage(
  code: AnalysisErrorCode,
  lastError: AnalysisError | null,
  t: TFunction,
  language: string
): string {
  if (code === 'rate_limited' && lastError?.code === 'rate_limited' && lastError.retryAt) {
    const time = formatTimestampDateTime(lastError.retryAt.toISOString(), language);
    return t('analysis.rateLimitedUntil', { time });
  }
  if (code === 'too_large') {
    const limit = MAX_DOCUMENT_BYTES / (1024 * 1024);
    return t('analysis.error.too_large', { count: MAX_DOCUMENT_PAGES, limit });
  }
  return t(`analysis.error.${code}`);
}

/**
 * An analysis in progress (ANL-3): while the pages upload, the app must stay open; then the job
 * waits on the server, in the queue or being analyzed, and the app may be closed. Either way it
 * can be cancelled (ANL-13).
 */
function AnalysisProgress({
  documentId,
  hasPrevious,
}: {
  documentId: string;
  hasPrevious: boolean;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const uploading = useIsUploading(documentId);
  const progress = useJobProgress(documentId);
  const cancel = useCancelAnalysis();

  const queuedBehind = progress?.status === 'queued' && progress.ahead > 0 ? progress.ahead : 0;
  const status = uploading
    ? t('analysis.uploading')
    : queuedBehind > 0
      ? t('analysis.queued', { count: queuedBehind })
      : t('analysis.processing');

  return (
    <ThemedView type="backgroundElement" style={styles.panel} aria-live="polite">
      <View style={styles.progress}>
        <ActivityIndicator color={theme.textSecondary} />
        <ThemedText type="smallBold" style={styles.status}>
          {status}
        </ThemedText>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {uploading ? t('analysis.keepOpenWhileUploading') : t('analysis.canClose')}
      </ThemedText>
      {hasPrevious && (
        <ThemedText type="small" themeColor="textSecondary">
          {t('analysis.previousShown')}
        </ThemedText>
      )}
      {cancel.isError && (
        <ThemedText type="small" role="alert">
          {t('analysis.cancelFailed')}
        </ThemedText>
      )}
      <View style={styles.actions}>
        <Button
          label={t('analysis.cancel')}
          variant="plain"
          disabled={cancel.isPending}
          onPress={() => cancel.mutate(documentId)}
        />
      </View>
    </ThemedView>
  );
}

/**
 * Where the analysis of a document stands, until it's ready (SPEC §6.3): a draft offers to analyze
 * it, an analysis in progress tells how far it is (ANL-3), a failed one says why and offers
 * «Try again» when that can help (ANL-9). Nothing once the document is ready. Analyzed before, the
 * document still shows that result meanwhile, and keeps it if the new one fails (ANL-8).
 */
export function AnalysisStatusPanel({
  document,
}: {
  document: Pick<DocumentRecord, 'id' | 'status' | 'errorCode' | 'analyzedAt'>;
}) {
  const { t, i18n } = useTranslation();
  const analyze = useAnalyzeDocument();
  const lastError = useLastAnalysisError(document.id);
  const start = () => analyze.mutate(document.id);

  switch (document.status) {
    case 'ready':
      return null;

    case 'analyzing':
      return <AnalysisProgress documentId={document.id} hasPrevious={!!document.analyzedAt} />;

    case 'failed': {
      // Every failure is stored with its code; an unknown one reads as an interrupted analysis.
      const code = document.errorCode ?? 'interrupted';
      return (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="small" role="alert">
            {failureMessage(code, lastError, t, i18n.language)}
          </ThemedText>
          {document.analyzedAt && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('analysis.previousKept')}
            </ThemedText>
          )}
          {isRetryable(code) && (
            <Button label={t('common.retry')} disabled={analyze.isPending} onPress={start} />
          )}
        </ThemedView>
      );
    }

    case 'draft':
      return (
        <ThemedView type="backgroundElement" style={styles.panel}>
          <ThemedText type="small">{t('analysis.draft')}</ThemedText>
          <Button label={t('analysis.start')} disabled={analyze.isPending} onPress={start} />
        </ThemedView>
      );
  }
}

const styles = StyleSheet.create({
  panel: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  status: {
    flexShrink: 1,
  },
  actions: {
    alignItems: 'flex-start',
  },
});
