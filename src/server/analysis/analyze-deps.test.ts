/** @jest-environment node */
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';

import { createAnalyzeDeps } from './analyze-deps';
import { MockLlmProvider } from './providers/mock-llm-provider';

const input = { files: [], locale: 'ru', today: '2026-10-18', timezone: 'Europe/Berlin' } as const;

describe('createAnalyzeDeps', () => {
  it('uses the mock provider and serves every version by default', () => {
    const deps = createAnalyzeDeps({});

    expect(deps.provider).toBeInstanceOf(MockLlmProvider);
    expect(deps.minAppVersion).toBeNull();
  });

  it('reads the mock fixture and the minimum app version', async () => {
    const deps = createAnalyzeDeps({ LLM_MOCK_FIXTURE: 'unreadable', MIN_APP_VERSION: '1.4.2' });

    expect(deps.minAppVersion).toEqual([1, 4, 2]);
    const { result } = await deps.provider.analyze({ ...input, files: [] });
    expect(result).toMatchObject({ title: ANALYSIS_FIXTURES.unreadable.title });
  });

  it.each([
    [{ LLM_PROVIDER: 'gpt-0' }, 'LLM_PROVIDER'],
    [{ LLM_MOCK_FIXTURE: 'receipt' }, 'LLM_MOCK_FIXTURE'],
    [{ LLM_MOCK_DELAY_MS: '1.5s' }, 'LLM_MOCK_DELAY_MS'],
    [{ MIN_APP_VERSION: 'v2' }, 'MIN_APP_VERSION'],
  ])('fails on a misconfigured %o', (env, name) => {
    expect(() => createAnalyzeDeps(env)).toThrow(name);
  });
});

describe('MockLlmProvider', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('answers after the delay without schemaVersion, like a model', async () => {
    const provider = new MockLlmProvider({ fixture: 'fraudulentInvoice', delayMs: 5000 });
    let settled = false;
    const call = provider.analyze({ ...input, files: [] }).finally(() => (settled = true));

    await jest.advanceTimersByTimeAsync(4999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    const { result } = await call;
    const { schemaVersion: _schemaVersion, ...expected } = ANALYSIS_FIXTURES.fraudulentInvoice;
    expect(result).toEqual(expected);
  });

  it('stops waiting when the request is aborted', async () => {
    const controller = new AbortController();
    const call = new MockLlmProvider({ delayMs: 60_000 }).analyze({
      ...input,
      files: [],
      signal: controller.signal,
    });

    controller.abort(new Error('client gone'));

    await expect(call).rejects.toThrow('client gone');
  });
});
