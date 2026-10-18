import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';

import type { LlmAnalyzeInput, LlmAnalyzeOutput, LlmProvider } from '../llm-provider';

export type MockFixtureName = keyof typeof ANALYSIS_FIXTURES;

export function isMockFixtureName(value: unknown): value is MockFixtureName {
  return typeof value === 'string' && Object.hasOwn(ANALYSIS_FIXTURES, value);
}

export type MockLlmProviderOptions = {
  /** Which fixture every call returns. Default: the invoice. */
  fixture?: MockFixtureName;
  /** How long a call takes, to see the progress screen or load the server like a real model. */
  delayMs?: number;
};

/**
 * Returns a synthetic analysis from `ANALYSIS_FIXTURES`, the way a model would: without
 * `schemaVersion`, which the server adds. Explanations are in Russian whatever the locale, and the
 * dates are fixed. It keeps the files until it answers, as a real provider keeps the request it
 * sent, so a load test with `delayMs` measures the memory of the real path (SPEC §7.1).
 */
export class MockLlmProvider implements LlmProvider {
  readonly id = 'mock';
  private readonly fixture: MockFixtureName;
  private readonly delayMs: number;

  constructor({ fixture = 'invoice', delayMs = 0 }: MockLlmProviderOptions = {}) {
    this.fixture = fixture;
    this.delayMs = delayMs;
  }

  async analyze(input: LlmAnalyzeInput): Promise<LlmAnalyzeOutput> {
    if (this.delayMs > 0) await delay(this.delayMs, input.signal);
    input.signal?.throwIfAborted();
    const { schemaVersion: _schemaVersion, ...result } = ANALYSIS_FIXTURES[this.fixture];
    return {
      result: structuredClone(result),
      usage: { inputTokens: 0, outputTokens: 0 },
      costUsd: 0,
    };
  }
}

function delay(ms: number, signal: AbortSignal | undefined) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true }
    );
  });
}
