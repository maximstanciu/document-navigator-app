import type { AnalyzeResponse } from '@/shared/analysis/contract';
import { MAX_DOCUMENT_PAGES } from '@/shared/limits';

import { ApiFailure } from '../http/api-failure';
import { readClientHeaders } from '../http/client-headers';
import { readClientIp } from '../http/client-ip';
import type { UsageSession } from '../limits/analysis-usage';
import type { EndCode } from '../limits/usage-keys';
import { redactError } from '../logs/server-log';
import { hashClientIp, hashDeviceId } from '../privacy/pseudonyms';
import type { ServerDeps } from '../server-deps';
import { finalizeAnalysis } from './finalize-analysis';
import { inspectPdf } from './inspect-pdf';
import { LlmProviderError, type LlmProvider } from './llm-provider';
import { readAnalyzeUpload, type AnalyzeUpload } from './read-analyze-upload';

export type AnalyzeDeps = ServerDeps & { provider: LlmProvider };

/**
 * What `analyze.end` reports besides the outcome: metadata only, never content (SPEC §7.1). Filled
 * in as the request gets further; `null` where it didn't get that far.
 */
type AnalyzeFacts = {
  platform: string | null;
  appVersion: string | null;
  kind: 'pdf' | 'images' | null;
  pages: number | null;
  bytes: number | null;
  locale: string | null;
  provider: string;
  modelMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  deadlines: number | null;
  fraudSignals: number | null;
  readable: boolean | null;
  /** Set once the limits are checked; the end of the request is counted against it. */
  usage: UsageSession | null;
};

/**
 * `POST /api/v1/analyze` (SPEC §7.2): checks the client and the upload, counts the pages, asks the
 * model and returns `{ analysis, pageCount }`, or an error body with a SPEC §7.2 code.
 *
 * Nothing is stored (D-1). Each request logs `analyze.start` once the client headers check out and
 * `analyze.end` with the outcome. If the client disconnects, the runtime cancels the handler with
 * the model call (spike 0.2), so an interrupted analysis is a start without an end (SPEC §8.7).
 */
export async function handleAnalyze(request: Request, deps: AnalyzeDeps): Promise<Response> {
  const startedAt = deps.now();
  // EAS Hosting finds a request by its Cf-Ray id, so logs and the Requests page line up.
  const requestId = request.headers.get('cf-ray') ?? crypto.randomUUID();
  const facts: AnalyzeFacts = {
    platform: null,
    appVersion: null,
    kind: null,
    pages: null,
    bytes: null,
    locale: null,
    provider: deps.provider.id,
    modelMs: null,
    inputTokens: null,
    outputTokens: null,
    costUsd: null,
    deadlines: null,
    fraudSignals: null,
    readable: null,
    usage: null,
  };
  const end = async (status: number, code: EndCode, error: string | null = null) => {
    const { usage, ...logged } = facts;
    deps.log({
      event: 'analyze.end',
      requestId,
      status,
      code,
      error,
      ms: deps.now() - startedAt,
      ...logged,
    });
    if (usage) {
      await deps.usage.end(usage, {
        code,
        charged: code === 'ok',
        costUsd: facts.costUsd,
        hasDeadline: (facts.deadlines ?? 0) > 0,
      });
    }
  };

  try {
    const response = await analyze(request, deps, requestId, facts);
    await end(200, 'ok');
    return response;
  } catch (error) {
    // The client is gone; on Workers this code doesn't even run. No end event either way.
    if (request.signal.aborted) throw error;
    if (error instanceof ApiFailure) {
      await end(error.status, error.code);
      return error.toResponse();
    }
    const redacted = redactError(error);
    await end(500, 'internal', redacted.name);
    throw redacted;
  }
}

async function analyze(
  request: Request,
  deps: AnalyzeDeps,
  requestId: string,
  facts: AnalyzeFacts
) {
  const client = readClientHeaders(request.headers, deps.minAppVersion);
  facts.platform = client.platform;
  facts.appVersion = client.appVersion.join('.');
  const declaredBytes = Number(request.headers.get('Content-Length'));
  const device = await hashDeviceId(client.deviceId, deps.deviceHashKey);
  deps.log({
    event: 'analyze.start',
    requestId,
    device,
    platform: client.platform,
    appVersion: facts.appVersion,
    bodyBytes: Number.isFinite(declaredBytes) && declaredBytes > 0 ? declaredBytes : null,
  });

  // Before the body is read, so a client over its limit doesn't upload 20 MB for nothing.
  const { session, rejection } = await deps.usage.begin({
    requestId,
    device,
    ip: await hashClientIp(readClientIp(request.headers), deps.deviceHashKey),
    platform: client.platform,
  });
  facts.usage = session;
  if (rejection) throw rejection;

  const upload = await readAnalyzeUpload(request);
  facts.kind = upload.kind;
  facts.bytes = upload.files.reduce((sum, file) => sum + file.bytes.byteLength, 0);
  facts.locale = upload.locale;

  const pageCount = await countPages(upload);
  facts.pages = pageCount;

  const context = { today: upload.today, pageCount };
  const modelStartedAt = deps.now();
  const { result, usage, costUsd } = await callProvider(
    deps.provider,
    upload,
    request.signal,
    (output) => {
      const checked = finalizeAnalysis(output, context);
      return checked.ok ? null : checked.error;
    }
  );
  facts.modelMs = deps.now() - modelStartedAt;
  facts.inputTokens = usage.inputTokens;
  facts.outputTokens = usage.outputTokens;
  facts.costUsd = costUsd;

  // The provider has already asked once more with the error (`checkShape`, SPEC §7.4).
  const finalized = finalizeAnalysis(result, context);
  if (!finalized.ok) {
    throw new ApiFailure('analysis_failed', 'The model returned an invalid analysis.');
  }
  const { analysis } = finalized;
  facts.deadlines = analysis.deadlines.length;
  facts.fraudSignals = analysis.fraudSignals.length;
  facts.readable = analysis.quality.readable;
  return Response.json({ analysis, pageCount } satisfies AnalyzeResponse);
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
async function callProvider(
  provider: LlmProvider,
  upload: AnalyzeUpload,
  signal: AbortSignal,
  checkShape: (result: unknown) => string | null
) {
  const files = upload.files.splice(0);
  try {
    return await provider.analyze({
      files,
      locale: upload.locale,
      today: upload.today,
      timezone: upload.timezone,
      signal,
      checkShape,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof LlmProviderError) throw new ApiFailure(error.code, error.message);
    throw new ApiFailure('unavailable', 'The analysis service is unavailable.');
  }
}
