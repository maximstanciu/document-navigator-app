import { llmOutputFixture } from '@/shared/analysis/fixtures';

import type { LlmAnalyzeInput, LlmProvider } from '../analysis/llm-provider';

export type GatedCall = {
  /** What the provider got; `files` is a copy, since a provider empties the array it owns. */
  input: LlmAnalyzeInput;
  /** Answers with `result` (by default a valid model output for the contract fixture). */
  answer(result?: unknown, costUsd?: number): void;
  fail(error: unknown): void;
  /** Whether the job aborted the call. */
  aborted(): boolean;
};

/**
 * A provider whose calls wait until the test answers them, so a test can look at a job while the
 * model "works". An aborted call rejects with the signal's reason, as a real one does.
 */
export function gatedProvider(id = 'gated') {
  const calls: GatedCall[] = [];
  const provider: LlmProvider = {
    id,
    analyze: (input) =>
      new Promise((resolve, reject) => {
        const { signal } = input;
        calls.push({
          input: { ...input, files: [...input.files] },
          answer: (result = llmOutputFixture('contract'), costUsd = 0.01) =>
            resolve({ result, usage: { inputTokens: 100, outputTokens: 50 }, costUsd }),
          fail: reject,
          aborted: () => signal?.aborted ?? false,
        });
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      }),
  };
  return { provider, calls };
}

/** Lets the work queued behind settled promises (the worker's bookkeeping) run. */
export function settle() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}
