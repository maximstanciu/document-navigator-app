import type { AnalyzeResponse } from '@/shared/analysis/contract';
import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { ApiFailure } from '../http/api-failure';
import type { AppVersion } from '../http/app-version';
import { readClientHeaders } from '../http/client-headers';
import { finalizeAnalysis } from './finalize-analysis';
import { inspectPdf } from './inspect-pdf';
import type { LlmProvider } from './llm-provider';
import { readAnalyzeUpload, type AnalyzeUpload } from './read-analyze-upload';

export type AnalyzeDeps = {
  provider: LlmProvider;
  /** Older apps get `426 upgrade_required`; `null` serves every version. */
  minAppVersion: AppVersion | null;
};

/**
 * `POST /api/v1/analyze` (SPEC §7.2): checks the client and the upload, counts the pages, asks the
 * model and returns `{ analysis, pageCount }`, or an error body with a SPEC §7.2 code.
 *
 * Nothing is stored (D-1). If the client disconnects, the runtime cancels the handler together
 * with the model call (spike 0.2).
 */
export async function handleAnalyze(request: Request, deps: AnalyzeDeps): Promise<Response> {
  try {
    readClientHeaders(request.headers, deps.minAppVersion);
    // Limits (task 3.4) go here, before the body is read.
    const upload = await readAnalyzeUpload(request);
    const pageCount = await countPages(upload);
    const output = await callProvider(deps.provider, upload, request.signal);
    // A retry with the error for the model comes with the real provider (task 3.2).
    const finalized = finalizeAnalysis(output, { today: upload.today, pageCount });
    if (!finalized.ok) {
      throw new ApiFailure('analysis_failed', 'The model returned an invalid analysis.');
    }
    return Response.json({ analysis: finalized.analysis, pageCount } satisfies AnalyzeResponse);
  } catch (error) {
    if (error instanceof ApiFailure) return error.toResponse();
    throw error;
  }
}

async function countPages(upload: AnalyzeUpload): Promise<number> {
  let pageCount = upload.files.length;
  if (upload.kind === 'pdf') {
    const pdf = await inspectPdf(upload.files[0].bytes);
    if (pdf.kind === 'encrypted') {
      throw new ApiFailure('encrypted_pdf', 'The PDF is protected with a password.');
    }
    if (pdf.kind === 'invalid') {
      throw new ApiFailure('invalid_pdf', 'The PDF is damaged or not a PDF.');
    }
    pageCount = pdf.pageCount;
  }
  if (pageCount > MAX_DOCUMENT_PAGES) {
    throw new ApiFailure('too_large', `More than ${MAX_DOCUMENT_PAGES} pages.`);
  }
  return pageCount;
}

/**
 * Hands the files over to the provider. `upload` is emptied first, so the handler holds no
 * reference to the bytes while the model works (SPEC §7.1).
 */
async function callProvider(provider: LlmProvider, upload: AnalyzeUpload, signal: AbortSignal) {
  const files = upload.files.splice(0);
  try {
    const { result } = await provider.analyze({
      files,
      locale: upload.locale,
      today: upload.today,
      timezone: upload.timezone,
      signal,
    });
    return result;
  } catch (error) {
    if (signal.aborted) throw error;
    // Provider errors get their own codes with the real provider (task 3.2).
    throw new ApiFailure('unavailable', 'The analysis service is unavailable.');
  }
}
