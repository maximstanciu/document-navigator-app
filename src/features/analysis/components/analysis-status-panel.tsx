import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui/button';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Spacing } from '@/constants/theme';
import type { DocumentRecord } from '@/lib/db/types';
import { formatTimestampDateTime } from '@/lib/i18n/format';
import { PDF_MIME_TYPE } from '@/shared/analysis/contract';
import { MAX_DOCUMENT_BYTES, MAX_IMAGE_PAGES, MAX_PDF_PAGES } from '@/shared/limits';

import { isRetryable, type AnalysisError, type AnalysisErrorCode } from '../errors';
import {
  useAnalyzeDocument,
  useCancelAnalysis,
  useIsUploading,
  useJobProgress,
  useLastAnalysisError,
} from '../queries';

/**
 * The text for a failed analysis (ANL-9). `lastError` adds when a `429` lets the person retry;
 * `mimeType` picks the page limit that applies (CAP-7).
 */
function failureMessage(
  code: AnalysisErrorCode,
  lastError: AnalysisError | null,
  mimeType: DocumentRecord['mimeType'],
  t: TFunction,
  language: string
): string {
  if (code === 'rate_limited' && lastError?.code === 'rate_limited' && lastError.retryAt) {
    const time = formatTimestampDateTime(lastError.retryAt.toISOString(), language);
    return t('analysis.rateLimitedUntil', { time });
  }
  if (code === 'too_large') {
    const limit = MAX_DOCUMENT_BYTES / (1024 * 1024);
    const count = mimeType === PDF_MIME_TYPE ? MAX_PDF_PAGES : MAX_IMAGE_PAGES;
    return t('analysis.error.too_large', { count, limit });
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
        <ThemedText type="smallBold">{status}</ThemedText>
        {/* The status above says it in words; the bar only shows that the work goes on. */}
        <ProgressBar aria-hidden />
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
  document: Pick<DocumentRecord, 'id' | 'status' | 'errorCode' | 'analyzedAt' | 'mimeType'>;
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
            {failureMessage(code, lastError, document.mimeType, t, i18n.language)}
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
    gap: Spacing.two,
  },
  actions: {
    alignItems: 'flex-start',
  },
});
