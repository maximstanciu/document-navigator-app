import { parseAppVersion } from '../http/app-version';
import { consoleServerLog } from '../logs/server-log';
import type { AnalyzeDeps } from './handle-analyze';
import type { LlmProvider } from './llm-provider';
import { isMockFixtureName, MockLlmProvider } from './providers/mock-llm-provider';

type ServerEnv = Record<string, string | undefined>;

/**
 * Builds the analyze handler's dependencies from server environment variables (EAS environment
 * variables on EAS Hosting, `.env.local` in development). A misconfigured server fails loudly:
 * the error names the variable, never a value.
 *
 * - `LLM_PROVIDER`: unset — `MockLlmProvider` (SPEC §7.5).
 * - `LLM_MOCK_FIXTURE`, `LLM_MOCK_DELAY_MS`: what the mock returns and how long it takes.
 * - `MIN_APP_VERSION`: `major.minor.patch`; older apps get `426`. Unset — every version.
 * - `DEVICE_ID_HASH_KEY`: the HMAC key for device ids in logs, a sensitive EAS variable on every
 *   deployment. Unset — a development key that anyone could reproduce.
 */
export function createAnalyzeDeps(env: ServerEnv = process.env): AnalyzeDeps {
  return {
    provider: createLlmProvider(env),
    minAppVersion: readMinAppVersion(env),
    deviceHashKey: env.DEVICE_ID_HASH_KEY || DEVELOPMENT_HASH_KEY,
    log: consoleServerLog,
    now: Date.now,
  };
}

const DEVELOPMENT_HASH_KEY = 'docnavigator-development';

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

function readMinAppVersion(env: ServerEnv) {
  if (!env.MIN_APP_VERSION) return null;
  const version = parseAppVersion(env.MIN_APP_VERSION);
  if (!version) throw new Error('MIN_APP_VERSION must be major.minor.patch.');
  return version;
}
