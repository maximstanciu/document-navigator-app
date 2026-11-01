import type { ServerEnv } from '../server-deps';
import type { LlmProvider } from './llm-provider';
import { HttpPdfRenderer } from './pdf-renderer';
import { isMockFixtureName, MockLlmProvider } from './providers/mock-llm-provider';
import { OpenAiCompatibleProvider } from './providers/openai-compatible-provider';

/**
 * The model that analyzes the jobs, from server environment variables. A misconfigured server
 * fails loudly: the error names the variable, never a value.
 *
 * - `LLM_PROVIDER`: unset — `MockLlmProvider` (SPEC §7.5); `openai-compatible` — a model behind
 *   an OpenAI-compatible API (Ollama in deploy/compose.yaml, SPEC D-6).
 * - `LLM_MOCK_FIXTURE`, `LLM_MOCK_DELAY_MS`: what the mock returns and how long it takes.
 * - `LLM_BASE_URL`, `LLM_MODEL`, `LLM_API_KEY` (optional), `LLM_REASONING_EFFORT` (optional),
 *   `PDF_RENDER_URL`: the OpenAI-compatible model and the service that renders PDF pages for it.
 *
 * `fetch` replaces the global one for the model and the renderer: the eval runner (scripts/eval/)
 * passes one without the 5-minute header timeout of Node's fetch, which deploy/server.js lifts with
 * undici for the server.
 */
export function createLlmProvider(
  env: ServerEnv = process.env,
  { fetch }: { fetch?: typeof globalThis.fetch } = {}
): LlmProvider {
  const id = env.LLM_PROVIDER || 'mock';
  if (id === 'openai-compatible') {
    return new OpenAiCompatibleProvider({
      baseUrl: requiredUrl(env, 'LLM_BASE_URL'),
      model: required(env, 'LLM_MODEL'),
      apiKey: env.LLM_API_KEY || null,
      reasoningEffort: env.LLM_REASONING_EFFORT || null,
      pdfRenderer: new HttpPdfRenderer({ url: requiredUrl(env, 'PDF_RENDER_URL'), fetch }),
      fetch,
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
