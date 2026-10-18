import { createServerDeps, type ServerEnv } from '../server-deps';
import type { AnalyzeDeps } from './handle-analyze';
import type { LlmProvider } from './llm-provider';
import { isMockFixtureName, MockLlmProvider } from './providers/mock-llm-provider';

/**
 * The analyze handler's dependencies: the server's (`createServerDeps()`) and the model.
 *
 * - `LLM_PROVIDER`: unset — `MockLlmProvider` (SPEC §7.5).
 * - `LLM_MOCK_FIXTURE`, `LLM_MOCK_DELAY_MS`: what the mock returns and how long it takes.
 */
export function createAnalyzeDeps(env: ServerEnv = process.env): AnalyzeDeps {
  return { ...createServerDeps(env), provider: createLlmProvider(env) };
}

function createLlmProvider(env: ServerEnv): LlmProvider {
  const id = env.LLM_PROVIDER || 'mock';
  if (id !== 'mock') throw new Error('LLM_PROVIDER names an unknown provider.');

  const fixture = env.LLM_MOCK_FIXTURE || undefined;
  if (fixture !== undefined && !isMockFixtureName(fixture)) {
    throw new Error('LLM_MOCK_FIXTURE names an unknown fixture.');
  }
  const delayMs = Number(env.LLM_MOCK_DELAY_MS || 0);
  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new Error('LLM_MOCK_DELAY_MS must be a whole number of milliseconds.');
  }
  return new MockLlmProvider({ fixture, delayMs });
}
