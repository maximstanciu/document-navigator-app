import type { ClientPlatform } from '@/shared/api-headers';

import type { AnalysisOutcome } from '../limits/analysis-usage';
import { testServerDeps } from '../testing/server-deps';
import { readBetaReport } from './beta-report';

const DAY_MS = 24 * 60 * 60 * 1000;

type Deps = ReturnType<typeof testServerDeps>;

async function analysis(
  deps: Deps,
  {
    device = 'd1',
    platform = 'android' as ClientPlatform,
    outcome,
  }: {
    device?: string;
    platform?: ClientPlatform;
    outcome: AnalysisOutcome | null;
  }
) {
  const { session } = await deps.usage.begin({ requestId: 'r', device, ip: 'ip', platform });
  if (outcome) await deps.usage.end(session, outcome);
}

const ok = (hasDeadline = true, costUsd = 0.02): AnalysisOutcome => ({
  code: 'ok',
  charged: true,
  costUsd,
  hasDeadline,
});
const failed = (code: AnalysisOutcome['code']): AnalysisOutcome => ({
  code,
  charged: false,
  costUsd: null,
  hasDeadline: false,
});

describe('readBetaReport', () => {
  it('reports a day of analyses with the SPEC §8.7 shares', async () => {
    const deps = testServerDeps();
    await analysis(deps, { outcome: ok(true) });
    await analysis(deps, { outcome: ok(false) });
    await analysis(deps, { device: 'd2', platform: 'ios', outcome: ok(true) });
    await analysis(deps, { device: 'd2', platform: 'ios', outcome: null });
    await analysis(deps, { device: 'd3', platform: 'ios', outcome: failed('rate_limited') });
    await analysis(deps, { device: 'd3', outcome: failed('analysis_failed') });

    const [today] = await readBetaReport(deps.store, deps.now(), 1);

    expect(today).toEqual({
      day: '2026-10-18',
      started: 6,
      ended: 5,
      interrupted: 1,
      byPlatform: {
        ios: { started: 3, ended: 2, interrupted: 1 },
        android: { started: 3, ended: 3, interrupted: 0 },
        web: { started: 0, ended: 0, interrupted: 0 },
      },
      outcomes: expect.objectContaining({
        ok: 3,
        rate_limited: 1,
        analysis_failed: 1,
        internal: 0,
      }),
      withDeadline: 2,
      devices: 3,
      returningDevices: 0,
      costUsd: 0.06,
      shares: {
        interrupted: 0.167,
        withDeadline: 0.667,
        rateLimited: 0.2,
        analysisFailed: 0.2,
        unavailable: 0,
      },
    });
  });

  it('counts a device as returning when it was seen 7 or more days earlier', async () => {
    const deps = testServerDeps();
    await analysis(deps, { device: 'week-ago', outcome: ok() });
    await analysis(deps, { device: 'yesterday', outcome: ok() });
    deps.advance(6 * DAY_MS);
    await analysis(deps, { device: 'yesterday', outcome: ok() });
    deps.advance(1 * DAY_MS);
    await analysis(deps, { device: 'week-ago', outcome: ok() });
    await analysis(deps, { device: 'yesterday', outcome: ok() });
    await analysis(deps, { device: 'new', outcome: ok() });

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
});
