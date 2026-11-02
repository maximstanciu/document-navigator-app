import type { ClientPlatform } from '@/shared/api-headers';

import type { JobOutcome } from '../limits/analysis-usage';
import type { PushOutcome, UploadEndCode } from '../limits/usage-keys';
import { testServerDeps } from '../testing/server-deps';
import { readBetaReport } from './beta-report';

const DAY_MS = 24 * 60 * 60 * 1000;

type Deps = ReturnType<typeof testServerDeps>;

/**
 * One upload and what came of it: `upload: null` broke off; an accepted job ends with `job`
 * (`null`: lost on a restart), the push about it goes as `push` says, and its result is `fetched`,
 * `expired` or neither.
 */
async function analysis(
  deps: Deps,
  {
    device = 'd1',
    platform = 'android' as ClientPlatform,
    upload = 'accepted',
    job = null,
    push = null,
    result = null,
  }: {
    device?: string;
    platform?: ClientPlatform;
    upload?: UploadEndCode | null;
    job?: JobOutcome | null;
    push?: PushOutcome | null;
    result?: 'fetched' | 'expired' | null;
  }
) {
  const { session } = await deps.usage.begin({ requestId: 'r', device, ip: 'ip', platform });
  if (!upload) return;
  await deps.usage.uploadEnded(session, upload);
  if (job) await deps.usage.jobEnded(session, job);
  if (push) await deps.usage.pushSent(session, push);
  if (result === 'fetched') await deps.usage.delivered(session);
  if (result === 'expired') await deps.usage.expired(session);
}

const ok = (hasDeadline = true, costUsd = 0.02): JobOutcome => ({
  code: 'ok',
  costUsd,
  hasDeadline,
});
const failed = (code: JobOutcome['code']): JobOutcome => ({
  code,
  costUsd: null,
  hasDeadline: false,
});

describe('readBetaReport', () => {
  it('reports a day of uploads and jobs with the SPEC §8.7 shares', async () => {
    const deps = testServerDeps();
    await analysis(deps, { job: ok(true), push: 'ok', result: 'fetched' });
    await analysis(deps, { job: ok(false), push: 'DeviceNotRegistered', result: 'expired' });
    await analysis(deps, {
      device: 'd2',
      platform: 'ios',
      job: ok(true),
      push: 'ok',
      result: 'fetched',
    });
    await analysis(deps, { device: 'd2', platform: 'ios', upload: null });
    await analysis(deps, { device: 'd3', platform: 'ios', upload: 'rate_limited' });
    await analysis(deps, { device: 'd3', upload: 'too_many_jobs' });
    await analysis(deps, { device: 'd3', job: failed('analysis_failed') });
    await analysis(deps, { device: 'd3', job: failed('unavailable') });
    await analysis(deps, { device: 'd3', job: failed('cancelled') });
    await analysis(deps, { device: 'd3', job: null });

    const [today] = await readBetaReport(deps.store, deps.now(), 1);

    expect(today).toEqual({
      day: '2026-10-18',
      started: 10,
      ended: 9,
      interrupted: 1,
      byPlatform: {
        ios: { started: 3, ended: 2, interrupted: 1 },
        android: { started: 7, ended: 7, interrupted: 0 },
        web: { started: 0, ended: 0, interrupted: 0 },
      },
      uploads: expect.objectContaining({
        accepted: 7,
        rate_limited: 1,
        too_many_jobs: 1,
        unavailable: 0,
        internal: 0,
      }),
      jobs: { ok: 3, analysis_failed: 1, unavailable: 1, cancelled: 1, internal: 0 },
      lost: 1,
      delivered: 2,
      expired: 1,
      withDeadline: 2,
      pushes: expect.objectContaining({ ok: 2, DeviceNotRegistered: 1, network: 0 }),
      devices: 3,
      returningDevices: 0,
      costUsd: 0.06,
      shares: {
        interrupted: 0.1,
        lost: 0.286,
        withDeadline: 0.667,
        rateLimited: 0.222,
        analysisFailed: 0.167,
        unavailable: 0.111,
      },
    });
  });

  it('counts a device as returning when it was seen 7 or more days earlier', async () => {
    const deps = testServerDeps();
    await analysis(deps, { device: 'week-ago', job: ok() });
    await analysis(deps, { device: 'yesterday', job: ok() });
    deps.advance(6 * DAY_MS);
    await analysis(deps, { device: 'yesterday', job: ok() });
    deps.advance(1 * DAY_MS);
    await analysis(deps, { device: 'week-ago', job: ok() });
    await analysis(deps, { device: 'yesterday', job: ok() });
    await analysis(deps, { device: 'new', job: ok() });

    const report = await readBetaReport(deps.store, deps.now(), 8);

    expect(report.map((day) => day.day)).toEqual([
      '2026-10-25',
      '2026-10-24',
      '2026-10-23',
      '2026-10-22',
      '2026-10-21',
      '2026-10-20',
      '2026-10-19',
      '2026-10-18',
    ]);
    // "yesterday" came back after 7 days too, counting from its first visit.
    expect(report[0]).toMatchObject({ devices: 3, returningDevices: 2 });
    expect(report[1]).toMatchObject({ devices: 1, returningDevices: 0 });
    expect(report[2]).toMatchObject({ started: 0, devices: 0, shares: { interrupted: null } });
  });

  it('counts a job on the day of its upload, and its cost on the day the model answered', async () => {
    const deps = testServerDeps();
    const { session } = await deps.usage.begin({
      requestId: 'r',
      device: 'd',
      ip: 'ip',
      platform: 'android',
    });
    await deps.usage.uploadEnded(session, 'accepted');
    deps.advance(DAY_MS);
    await deps.usage.jobEnded(session, ok(true, 0.5));

    const [today, yesterday] = await readBetaReport(deps.store, deps.now(), 2);

    expect(yesterday).toMatchObject({ jobs: { ok: 1 }, lost: 0, withDeadline: 1, costUsd: 0 });
    expect(today).toMatchObject({ started: 0, costUsd: 0.5 });
  });
});
