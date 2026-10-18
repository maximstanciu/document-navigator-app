/** @jest-environment node */
import { createServerDeps } from './server-deps';
import { MemoryCounterStore } from './store/counter-store';
import { UpstashCounterStore } from './store/upstash-counter-store';

describe('createServerDeps', () => {
  it('works without any variables, for the dev server', () => {
    const deps = createServerDeps({});

    expect(deps.store).toBeInstanceOf(MemoryCounterStore);
    expect(deps.minAppVersion).toBeNull();
    expect(deps.metricsToken).toBeNull();
    // One store per process, so counters survive between requests.
    expect(createServerDeps({}).store).toBe(deps.store);
  });

  it('uses Upstash when both of its variables are set', () => {
    const deps = createServerDeps({
      UPSTASH_REDIS_REST_URL: 'https://eu1-test.upstash.io',
      UPSTASH_REDIS_REST_TOKEN: 'token',
    });
    expect(deps.store).toBeInstanceOf(UpstashCounterStore);
  });

  it('reads the metrics token and the minimum app version', () => {
    const deps = createServerDeps({ METRICS_TOKEN: 't'.repeat(32), MIN_APP_VERSION: '1.4.2' });
    expect(deps.metricsToken).toBe('t'.repeat(32));
    expect(deps.minAppVersion).toEqual([1, 4, 2]);
  });

  it.each([
    [{ UPSTASH_REDIS_REST_URL: 'https://eu1-test.upstash.io' }, 'UPSTASH_REDIS_REST_TOKEN'],
    [{ UPSTASH_REDIS_REST_TOKEN: 'token' }, 'UPSTASH_REDIS_REST_URL'],
    [{ IP_ATTEMPTS_PER_HOUR: '0' }, 'IP_ATTEMPTS_PER_HOUR'],
    [{ IP_ATTEMPTS_PER_HOUR: '2.5' }, 'IP_ATTEMPTS_PER_HOUR'],
    [{ DAILY_BUDGET_USD: '-1' }, 'DAILY_BUDGET_USD'],
    [{ DAILY_BUDGET_USD: 'ten' }, 'DAILY_BUDGET_USD'],
    [{ METRICS_TOKEN: 'short' }, 'METRICS_TOKEN'],
    [{ MIN_APP_VERSION: 'v2' }, 'MIN_APP_VERSION'],
  ])('fails on a misconfigured %o, naming the variable', (env, name) => {
    expect(() => createServerDeps(env)).toThrow(name);
  });
});
