import { createServerDeps, type ServerEnv } from '../server-deps';
import type { AnalyzeDeps } from './handle-analyze';
import type { LlmProvider } from './llm-provider';
import { HttpPdfRenderer } from './pdf-renderer';
import { isMockFixtureName, MockLlmProvider } from './providers/mock-llm-provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible-provider';

/**
 * The analyze handler's dependencies: the server's (`createServerDeps()`) and the model.
 *
 * - `LLM_PROVIDER`: unset — `MockLlmProvider` (SPEC §7.5); `openai-compatible` — a model behind
 *   an OpenAI-compatible API (Ollama in deploy/compose.yaml, SPEC D-6).
 * - `LLM_MOCK_FIXTURE`, `LLM_MOCK_DELAY_MS`: what the mock returns and how long it takes.
 * - `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` (optional), `LLM_REASONING_EFFORT` (optional),
 *   `PDF_RENDER_URL`: the OpenAI-compatible model and the service that renders PDF pages for it.
 */
export function createAnalyzeDeps(env: ServerEnv = process.env): AnalyzeDeps {
  return { ...createServerDeps(env), provider: createLlmProvider(env) };
}

function createLlmProvider(env: ServerEnv): LlmProvider {
  const id = env.LLM_PROVIDER || 'mock';
  if (id === 'openai-compatible') {
    return new OpenAiCompatibleProvider({
      baseUrl: requiredUrl(env, 'LLM_BASE_URL'),
      model: required(env, 'LLM_MODEL'),
      apiKey: env.LLM_API_KEY || null,
      reasoningEffort: env.LLM_REASONING_EFFORT || null,
      pdfRenderer: new HttpPdfRenderer({ url: requiredUrl(env, 'PDF_RENDER_URL') }),
    });
  }
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

function required(env: ServerEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`${name} must be set for LLM_PROVIDER=openai-compatible.`);
  return value;
}

function requiredUrl(env: ServerEnv, name: string): string {
  const value = required(env, name);
  if (!URL.canParse(value) || !/^https?:$/.test(new URL(value).protocol)) {
    throw new Error(`${name} must be an http(s) URL.`);
  }
  return value;
}
