import type { UploadMimeType } from '@/shared/analysis/contract';
import type { ExplanationLocale } from '@/shared/explanation-locales';

// The model behind the analysis (SPEC §7.5). `MockLlmProvider` serves tests and development
// without a key; `OpenAiCompatibleProvider` talks to a model behind an OpenAI-compatible API.

export type LlmFile = { mimeType: UploadMimeType; bytes: Uint8Array };

export type LlmAnalyzeInput = {
  /**
   * Pages in order: one PDF or JPEG images. The provider owns this array: the handler keeps no
   * other reference to the bytes, so once the provider has encoded a file and dropped it (e.g.
   * emptied the array with `splice`), the memory can be freed before the model answers (SPEC §7.1).
   */
  files: LlmFile[];
  locale: ExplanationLocale;
  /** YYYY-MM-DD on the device. */
  today: string;
  /** IANA time zone of the device. */
  timezone: string;
  signal?: AbortSignal;
  /**
   * Checks the shape of an answer: `null` if it fits, else what is wrong with it. A provider that
   * gets one asks the model once more with the error (SPEC §7.4); the mock ignores it.
   */
  checkShape?: (result: unknown) => string | null;
};

export type LlmAnalyzeOutput = {
  /** The model's JSON, not validated yet: the handler checks it against `llmAnalysisSchema`. */
  result: unknown;
  usage: { inputTokens: number; outputTokens: number };
  /** What the call cost by the provider's prices, for logs and the daily budget (SPEC §8.3). */
  costUsd: number;
};

export interface LlmProvider {
  /** 'mock' or '<provider>-<model>'. */
  readonly id: string;
  analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeOutput>;
}

/**
 * A provider call that failed, with the SPEC §7.2 code the client gets. The message is for
 * developers and never quotes the document or the model's answer.
 */
export class LlmProviderError extends Error {
  constructor(
    readonly code: 'unavailable' | 'analysis_failed' | 'invalid_pdf',
    message: string
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }
}
