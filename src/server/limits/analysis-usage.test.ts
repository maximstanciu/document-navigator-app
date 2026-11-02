import { StoreUnavailableError, type CounterStore } from '../store/counter-store';
import { testServerDeps } from '../testing/server-deps';
import type { JobOutcome, UsageSession } from './analysis-usage';

const CLIENT: Omit<UsageSession, 'day'> = {
  requestId: 'r1',
  device: 'dev1',
  ip: 'ip1',
  platform: 'android',
};
const OK: JobOutcome = { code: 'ok', costUsd: 0.01, hasDeadline: true };

const failingStore: CounterStore = {
  run: async () => {
    throw new StoreUnavailableError('down');
  },
};

type Deps = ReturnType<typeof testServerDeps>;

/** What the limits say about a new upload of `client` with `unfinished` jobs. */
async function attempt(deps: Deps, unfinished = 0, client = CLIENT) {
  const { session, counts } = await deps.usage.begin(client);
  return { session, rejection: deps.usage.rejection(counts, unfinished) };
}

/** Runs `count` analyses of `client` to the app getting the result. */
async function analyses(deps: Deps, count: number, outcome: JobOutcome = OK, client = CLIENT) {
  for (let i = 0; i < count; i++) {
    const { session, rejection } = await attempt(deps, 0, client);
    expect(rejection).toBeNull();
    await deps.usage.uploadEnded(session, 'accepted');
    await deps.usage.jobEnded(session, outcome);
    if (outcome.code === 'ok') await deps.usage.delivered(session);
  }
}

describe('AnalysisUsage', () => {
  it('lets a device have its daily analyses, then answers 429 until midnight UTC', async () => {
    const deps = testServerDeps();
    await analyses(deps, 10);

    const { rejection } = await attempt(deps);

    expect(rejection).toMatchObject({ status: 429, code: 'rate_limited' });
    // TEST_NOW is 12:00 UTC.
    expect(rejection?.headers).toEqual({ 'Retry-After': String(12 * 60 * 60) });

    deps.advance(12 * 60 * 60 * 1000);
    await expect(attempt(deps)).resolves.toMatchObject({ rejection: null });
  });

  it('counts unfinished jobs against the daily limit (SPEC §8.3)', async () => {
    const deps = testServerDeps();
    await analyses(deps, 8);

    await expect(attempt(deps, 1)).resolves.toMatchObject({ rejection: null });
    const { rejection } = await attempt(deps, 2);

    expect(rejection).toMatchObject({ status: 429, code: 'rate_limited' });
  });

  it('answers 429 too_many_jobs for a device with three unfinished jobs', async () => {
    const deps = testServerDeps();

    await expect(attempt(deps, 2)).resolves.toMatchObject({ rejection: null });
    const { rejection } = await attempt(deps, 3);

    expect(rejection).toMatchObject({ status: 429, code: 'too_many_jobs' });
    expect(rejection?.headers).toBeUndefined();
  });

  it('charges the device only for results it got', async () => {
    const deps = testServerDeps({ limits: { devicePerDay: 1 } });
    for (const code of ['analysis_failed', 'unavailable', 'cancelled', 'internal'] as const) {
      await analyses(deps, 2, { code, costUsd: 0.01, hasDeadline: false });
    }
    // A done job the app never fetched, which then expired, costs nothing either.
    const { session } = await attempt(deps);
    await deps.usage.jobEnded(session, OK);
    await deps.usage.expired(session);

    await expect(attempt(deps)).resolves.toMatchObject({ rejection: null });
    await deps.usage.delivered(session);
    await expect(attempt(deps)).resolves.toMatchObject({ rejection: { code: 'rate_limited' } });
  });

  it('charges the day the result was delivered, not the day of the upload', async () => {
    const deps = testServerDeps({ limits: { devicePerDay: 1 } });
    const { session } = await attempt(deps);
    await deps.usage.jobEnded(session, OK);

    deps.advance(12 * 60 * 60 * 1000);
    await deps.usage.delivered(session);

    await expect(attempt(deps)).resolves.toMatchObject({ rejection: { code: 'rate_limited' } });
  });

  it('counts attempts per IP address and hour, whatever the device', async () => {
    const deps = testServerDeps({ limits: { ipPerHour: 3 } });
    for (const device of ['a', 'b', 'c']) {
      await expect(attempt(deps, 0, { ...CLIENT, device })).resolves.toMatchObject({
        rejection: null,
      });
    }

    const { rejection } = await attempt(deps, 0, { ...CLIENT, device: 'd' });
    expect(rejection).toMatchObject({ status: 429, headers: { 'Retry-After': '3600' } });
    await expect(attempt(deps, 0, { ...CLIENT, ip: 'ip2' })).resolves.toMatchObject({
      rejection: null,
    });

    deps.advance(60 * 60 * 1000);
    await expect(attempt(deps, 0, { ...CLIENT, device: 'd' })).resolves.toMatchObject({
      rejection: null,
    });
  });

  it('answers 503 once the day’s model spend reaches the budget', async () => {
    const deps = testServerDeps({ limits: { dailyBudgetUsd: 0.03 } });
    await analyses(deps, 2, { ...OK, costUsd: 0.014 }, { ...CLIENT, device: 'a' });
    await expect(attempt(deps, 0, { ...CLIENT, device: 'b' })).resolves.toMatchObject({
      rejection: null,
    });
    await analyses(deps, 1, { code: 'analysis_failed', costUsd: 0.002, hasDeadline: false });

    const { rejection } = await attempt(deps, 0, { ...CLIENT, device: 'c' });

    expect(rejection).toMatchObject({ status: 503, code: 'unavailable' });
    expect(rejection?.headers).toEqual({ 'Retry-After': String(12 * 60 * 60) });
  });

  it('checks in the order of SPEC §7.2: daily limit, IP, unfinished jobs, budget', () => {
    const deps = testServerDeps({ limits: { ipPerHour: 1, dailyBudgetUsd: 1 } });
    const over = { analyses: 7, ipAttempts: 2, spentMicroUsd: 1_000_000 };

    expect(deps.usage.rejection(over, 3)).toMatchObject({
      code: 'rate_limited',
      headers: { 'Retry-After': String(12 * 60 * 60) },
    });
    expect(deps.usage.rejection({ ...over, analyses: 0 }, 3)).toMatchObject({
      code: 'rate_limited',
      headers: { 'Retry-After': '3600' },
    });
    expect(deps.usage.rejection({ ...over, analyses: 0, ipAttempts: 1 }, 3)).toMatchObject({
      code: 'too_many_jobs',
    });
    expect(deps.usage.rejection({ ...over, analyses: 0, ipAttempts: 1 }, 0)).toMatchObject({
      code: 'unavailable',
    });
    expect(deps.usage.rejection({ analyses: 0, ipAttempts: 1, spentMicroUsd: 0 }, 0)).toBeNull();
  });

  it('never stops for spend without a budget', async () => {
    const deps = testServerDeps({ limits: { devicePerDay: 1000 } });
    await analyses(deps, 20, { ...OK, costUsd: 100 });
    await expect(attempt(deps)).resolves.toMatchObject({ rejection: null });
  });

  it('lets the analysis go ahead when the store is down, and logs that (fail open)', async () => {
    const deps = testServerDeps({ store: failingStore });

    const { session, counts } = await deps.usage.begin(CLIENT);
    await deps.usage.uploadEnded(session, 'accepted');
    await deps.usage.jobEnded(session, OK);
    await deps.usage.delivered(session);
    await deps.usage.expired(session);

    expect(counts).toBeNull();
    expect(deps.usage.rejection(counts, 0)).toBeNull();
    // The device's jobs live in this process, so their limit still holds.
    expect(deps.usage.rejection(counts, 3)).toMatchObject({ code: 'too_many_jobs' });
    expect(deps.events).toEqual(
      ['begin', 'upload', 'job', 'delivered', 'expired'].map((step) => ({
        event: 'limits.unavailable',
        requestId: 'r1',
        step,
      }))
    );
  });

  it('tells the device what is left of its limit, less its unfinished jobs', async () => {
    const deps = testServerDeps();
    await analyses(deps, 3);

    await expect(deps.usage.remaining(CLIENT.device, 0)).resolves.toEqual({
      dailyLimit: 10,
      remaining: 7,
      resetsAt: '2026-10-19T00:00:00Z',
    });
    await expect(deps.usage.remaining(CLIENT.device, 2)).resolves.toMatchObject({ remaining: 5 });
    await expect(deps.usage.remaining('other', 0)).resolves.toMatchObject({ remaining: 10 });
  });

  it("doesn't guess the remaining limit when the store is down", async () => {
    const deps = testServerDeps({ store: failingStore });
    await expect(deps.usage.remaining(CLIENT.device, 0)).rejects.toBeInstanceOf(
      StoreUnavailableError
    );
  });

  it('lets limit counters expire and keeps metric counters for the retention', async () => {
    const deps = testServerDeps();
    const run = jest.spyOn(deps.store, 'run');
    await analyses(deps, 1);
    const { session } = await attempt(deps);
    await deps.usage.expired(session);
    await deps.usage.pushSent(session, 'ok');

    const commands = run.mock.calls.flatMap(([batch]) => batch);
    const expiry = Object.fromEntries(
      commands
        .filter((command) => command[0] === 'EXPIRE')
        .map(([, key, seconds]) => [key, seconds])
    );
    const retained = 90 * 24 * 60 * 60;
    expect(expiry).toEqual({
      'lim:ip:2026-10-18T12:ip1': 2 * 60 * 60,
      'lim:dev:2026-10-18:dev1': 2 * 24 * 60 * 60,
      'm:2026-10-18:start:android': retained,
      'm:2026-10-18:devices': retained,
      'm:2026-10-18:end:android:accepted': retained,
      'm:2026-10-18:job:ok': retained,
      'spend:2026-10-18': retained,
      'm:2026-10-18:deadline': retained,
      'm:2026-10-18:delivered': retained,
      'm:2026-10-18:expired': retained,
      'm:2026-10-18:push:ok': retained,
    });
  });
});
