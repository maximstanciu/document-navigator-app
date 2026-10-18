import { StoreUnavailableError, type CounterStore } from '../store/counter-store';
import { testServerDeps } from '../testing/server-deps';
import type { AnalysisOutcome, UsageSession } from './analysis-usage';

const CLIENT: Omit<UsageSession, 'day'> = {
  requestId: 'r1',
  device: 'dev1',
  ip: 'ip1',
  platform: 'android',
};
const OK: AnalysisOutcome = { code: 'ok', charged: true, costUsd: 0.01, hasDeadline: true };

const failingStore: CounterStore = {
  run: async () => {
    throw new StoreUnavailableError('down');
  },
};

/** Runs `count` analyses of `client` to the end with `outcome`. */
async function analyses(
  deps: ReturnType<typeof testServerDeps>,
  count: number,
  outcome: AnalysisOutcome = OK,
  client = CLIENT
) {
  for (let i = 0; i < count; i++) {
    const { session, rejection } = await deps.usage.begin(client);
    expect(rejection).toBeNull();
    await deps.usage.end(session, outcome);
  }
}

describe('AnalysisUsage', () => {
  it('lets a device have its daily analyses, then answers 429 until midnight UTC', async () => {
    const deps = testServerDeps();
    await analyses(deps, 10);

    const { rejection } = await deps.usage.begin(CLIENT);

    expect(rejection).toMatchObject({ status: 429, code: 'rate_limited' });
    // TEST_NOW is 12:00 UTC.
    expect(rejection?.headers).toEqual({ 'Retry-After': String(12 * 60 * 60) });

    deps.advance(12 * 60 * 60 * 1000);
    await expect(deps.usage.begin(CLIENT)).resolves.toMatchObject({ rejection: null });
  });

  it("doesn't charge the device for an analysis it didn't get", async () => {
    const deps = testServerDeps({ limits: { devicePerDay: 1 } });
    await analyses(deps, 3, {
      code: 'analysis_failed',
      charged: false,
      costUsd: 0.01,
      hasDeadline: false,
    });
    await analyses(deps, 3, {
      code: 'invalid_pdf',
      charged: false,
      costUsd: null,
      hasDeadline: false,
    });

    // A request that never reaches end() (the client hung up) isn't charged either.
    await deps.usage.begin(CLIENT);

    await expect(deps.usage.begin(CLIENT)).resolves.toMatchObject({ rejection: null });
  });

  it('counts attempts per IP address and hour, whatever the device', async () => {
    const deps = testServerDeps({ limits: { ipPerHour: 3 } });
    for (const device of ['a', 'b', 'c']) {
      await expect(deps.usage.begin({ ...CLIENT, device })).resolves.toMatchObject({
        rejection: null,
      });
    }

    const { rejection } = await deps.usage.begin({ ...CLIENT, device: 'd' });
    expect(rejection).toMatchObject({ status: 429, headers: { 'Retry-After': '3600' } });
    await expect(deps.usage.begin({ ...CLIENT, ip: 'ip2' })).resolves.toMatchObject({
      rejection: null,
    });

    deps.advance(60 * 60 * 1000);
    await expect(deps.usage.begin({ ...CLIENT, device: 'd' })).resolves.toMatchObject({
      rejection: null,
    });
  });

  it('answers 503 once the day’s model spend reaches the budget', async () => {
    const deps = testServerDeps({ limits: { dailyBudgetUsd: 0.03 } });
    await analyses(deps, 2, { ...OK, costUsd: 0.014 }, { ...CLIENT, device: 'a' });
    await expect(deps.usage.begin({ ...CLIENT, device: 'b' })).resolves.toMatchObject({
      rejection: null,
    });
    await analyses(deps, 1, {
      code: 'analysis_failed',
      charged: false,
      costUsd: 0.002,
      hasDeadline: false,
    });

    const { rejection } = await deps.usage.begin({ ...CLIENT, device: 'c' });

    expect(rejection).toMatchObject({ status: 503, code: 'unavailable' });
    expect(rejection?.headers).toEqual({ 'Retry-After': String(12 * 60 * 60) });
  });

  it('never stops for spend without a budget', async () => {
    const deps = testServerDeps({ limits: { devicePerDay: 1000 } });
    await analyses(deps, 20, { ...OK, costUsd: 100 });
    await expect(deps.usage.begin(CLIENT)).resolves.toMatchObject({ rejection: null });
  });

  it('lets the analysis go ahead when the store is down, and logs that (fail open)', async () => {
    const deps = testServerDeps({ store: failingStore });

    const { session, rejection } = await deps.usage.begin(CLIENT);
    await deps.usage.end(session, OK);

    expect(rejection).toBeNull();
    expect(deps.events).toEqual([
      { event: 'limits.unavailable', requestId: 'r1', step: 'begin' },
      { event: 'limits.unavailable', requestId: 'r1', step: 'end' },
    ]);
  });

  it('tells the device what is left of its limit', async () => {
    const deps = testServerDeps();
    await analyses(deps, 3);

    await expect(deps.usage.remaining(CLIENT.device)).resolves.toEqual({
      dailyLimit: 10,
      remaining: 7,
      resetsAt: '2026-10-19T00:00:00Z',
    });
    await expect(deps.usage.remaining('other')).resolves.toMatchObject({ remaining: 10 });
  });

  it("doesn't guess the remaining limit when the store is down", async () => {
    const deps = testServerDeps({ store: failingStore });
    await expect(deps.usage.remaining(CLIENT.device)).rejects.toBeInstanceOf(StoreUnavailableError);
  });

  it('lets limit counters expire and keeps metric counters for the retention', async () => {
    const deps = testServerDeps();
    const run = jest.spyOn(deps.store, 'run');
    await analyses(deps, 1);

    const commands = run.mock.calls.flatMap(([batch]) => batch);
    const expiry = Object.fromEntries(
      commands
        .filter((command) => command[0] === 'EXPIRE')
        .map(([, key, seconds]) => [key, seconds])
    );
    expect(expiry).toEqual({
      'lim:ip:2026-10-18T12:ip1': 2 * 60 * 60,
      'lim:dev:2026-10-18:dev1': 2 * 24 * 60 * 60,
      'm:2026-10-18:start:android': 90 * 24 * 60 * 60,
      'm:2026-10-18:devices': 90 * 24 * 60 * 60,
      'm:2026-10-18:end:android:ok': 90 * 24 * 60 * 60,
      'spend:2026-10-18': 90 * 24 * 60 * 60,
      'm:2026-10-18:deadline': 90 * 24 * 60 * 60,
    });
    expect(run).toHaveBeenCalledTimes(2);
  });
});
