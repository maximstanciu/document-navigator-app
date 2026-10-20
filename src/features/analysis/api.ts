import { randomUUID } from 'expo-crypto';
import { getCalendars } from 'expo-localization';

import { apiClient } from '@/lib/api/client';
import { getRepositories } from '@/lib/db/repositories';
import { env } from '@/lib/env';
import type { DocumentMimeType } from '@/lib/db/types';
import { pageFileExists, pageFileUri } from '@/lib/files/page-files';
import { currentLanguage } from '@/lib/i18n/i18n';
import { isOnline } from '@/lib/network';
import {
  ANALYZE_FIELDS,
  analyzeResponseSchema,
  type AnalyzeResponse,
} from '@/shared/analysis/contract';
import { localCalendarDate } from '@/shared/calendar-date';
import type { ExplanationLocale } from '@/shared/explanation-locales';
import { limitsResponseSchema, type LimitsResponse } from '@/shared/limits-contract';

import { analysisRecords } from './analysis-records';
import { AnalysisError, toAnalysisError } from './errors';
import { keepScreenAwake } from './keep-awake';
import { appendUploadFile, type UploadFile } from './upload-file';

/**
 * Data access for the analysis feature, no React: the request to `POST /api/v1/analyze` and the
 * document's way through `analyzing` to `ready` or `failed` (SPEC §6.3). `./queries.ts` wraps it.
 */

const ANALYZE_PATH = '/api/v1/analyze';
const LIMITS_PATH = '/api/v1/limits';

/**
 * The analysis is one synchronous request (D-1); the client gives up after 90 s (SPEC §7.2), or
 * after `EXPO_PUBLIC_ANALYZE_TIMEOUT_MS` in builds for a model on a CPU.
 */
export const ANALYZE_TIMEOUT_MS = env.analyzeTimeoutMs;

export type AnalyzeRequest = {
  files: readonly UploadFile[];
  locale: ExplanationLocale;
  /** The device's date, `YYYY-MM-DD`, and IANA time zone, for relative deadlines (ANL-5). */
  today: string;
  timezone: string;
};

/**
 * Sends the pages to `POST /api/v1/analyze` and returns the response, checked against the shared
 * schema. Fails as `apiClient` does (`ApiError`, `ApiTimeoutError`, a network `TypeError`), or with
 * `analysis_failed` when the body isn't a valid analysis.
 */
export async function requestAnalysis(request: AnalyzeRequest): Promise<AnalyzeResponse> {
  const form = new FormData();
  for (const file of request.files) await appendUploadFile(form, ANALYZE_FIELDS.files, file);
  form.append(ANALYZE_FIELDS.locale, request.locale);
  form.append(ANALYZE_FIELDS.today, request.today);
  form.append(ANALYZE_FIELDS.timezone, request.timezone);

  const body = await apiClient.post<unknown>(ANALYZE_PATH, {
    body: form,
    timeoutMs: ANALYZE_TIMEOUT_MS,
  });
  const parsed = analyzeResponseSchema.safeParse(body);
  if (!parsed.success) throw new AnalysisError('analysis_failed');
  return parsed.data;
}

/**
 * What is left of the device's daily limit (`GET /api/v1/limits`, SET-4). Fails as `apiClient` does,
 * or with a zod error when the body isn't what the contract says.
 */
export async function fetchLimits(): Promise<LimitsResponse> {
  return limitsResponseSchema.parse(await apiClient.get<unknown>(LIMITS_PATH));
}

/** The page files in order, under neutral names. Pages missing on the device fail the analysis (STO-8). */
async function filesToUpload(
  documentId: string,
  mimeType: DocumentMimeType
): Promise<UploadFile[]> {
  const pages = await getRepositories().pages.listByDocument(documentId);
  if (pages.length === 0) throw new AnalysisError('files_missing');
  const files: UploadFile[] = [];
  for (const page of pages) {
    if (!(await pageFileExists(page.relativePath))) throw new AnalysisError('files_missing');
    files.push({
      uri: pageFileUri(page.relativePath),
      name: mimeType === 'application/pdf' ? 'document.pdf' : `page-${page.index + 1}.jpg`,
      type: mimeType,
    });
  }
  return files;
}

/** «Explanation language» from settings, by default the interface language (D-5, SET-1). */
async function explanationLocale(): Promise<ExplanationLocale> {
  const { explanationLocale } = await getRepositories().settings.get();
  return explanationLocale ?? currentLanguage();
}

function deviceTimeZone(): string {
  return getCalendars()[0]?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
}

/**
 * Analyzes a draft or a failed document, or a ready one again (ANL-1…ANL-3, ANL-8, SPEC §6.3); a
 * new analysis merges with what the person did to the old one (`documents.saveAnalysis()`), and a
 * failed one leaves the old one in place. The document becomes `analyzing`
 * (then `onStarted` runs, so screens can show it), and ends up either `ready` with the analysis,
 * its deadlines and actions, or `failed` with the reason; the reason is also thrown as an
 * `AnalysisError`. The screen stays on meanwhile (D-1). Without a network the request isn't sent
 * and the document fails as `offline`, its pages kept (ANL-10).
 *
 * Throws a plain `Error` without touching the document when it's gone or already being analyzed.
 * A document deleted during the analysis stays deleted: the result is dropped.
 */
export async function analyzeDocument(
  documentId: string,
  onStarted?: () => unknown
): Promise<void> {
  const { documents } = getRepositories();
  if (!(await documents.startAnalysis(documentId))) {
    throw new Error(`Document ${documentId} can't be analyzed now`);
  }
  await onStarted?.();
  const release = keepScreenAwake(`analysis-${documentId}`);
  try {
    let response: AnalyzeResponse;
    let locale: ExplanationLocale;
    try {
      const document = await documents.get(documentId);
      if (!document) return;
      if (!(await isOnline())) throw new AnalysisError('offline');
      locale = await explanationLocale();
      response = await requestAnalysis({
        files: await filesToUpload(documentId, document.mimeType),
        locale,
        today: localCalendarDate(new Date()),
        timezone: deviceTimeZone(),
      });
    } catch (error) {
      const failure = toAnalysisError(error);
      await documents.failAnalysis(documentId, failure.code);
      throw failure;
    }

    try {
      await documents.saveAnalysis(documentId, {
        analysis: response.analysis,
        pageCount: response.pageCount,
        analysisLocale: locale,
        ...analysisRecords(documentId, response.analysis, randomUUID),
      });
    } catch (error) {
      // The result couldn't be stored: let the person try again instead of waiting forever.
      await documents.failAnalysis(documentId, 'interrupted');
      throw error;
    }
  } finally {
    release();
  }
}
