/** @jest-environment node */
import { JobDurations, seedPageMs } from './job-durations';

const MINUTE = 60_000;

describe('JobDurations', () => {
  it('has no estimate before an analysis ends, unless it was given one', () => {
    expect(new JobDurations().estimate(1)).toBeNull();
    // 5 minutes for one page: 2.5 a page, with the fixed part counted as one more page.
    const seeded = new JobDurations(seedPageMs(300));
    expect(seeded.estimate(1)).toBe(5 * MINUTE);
    expect(seeded.estimate(3)).toBe(10 * MINUTE);
    expect(seedPageMs(null)).toBeNull();
  });

  it('scales the last analysis to the pages of another, with the fixed part', () => {
    const durations = new JobDurations(seedPageMs(1000));
    durations.record(4, 10 * MINUTE);

    expect(durations.estimate(4)).toBe(10 * MINUTE);
    expect(durations.estimate(1)).toBe(4 * MINUTE);
    expect(durations.estimate(9)).toBe(20 * MINUTE);
  });

  it('takes the median, so one analysis made twice does not swing it (ANL-14)', () => {
    const durations = new JobDurations();
    durations.record(1, 4 * MINUTE);
    durations.record(1, 4 * MINUTE);
    durations.record(1, 9 * MINUTE);
    expect(durations.estimate(1)).toBe(4 * MINUTE);

    durations.record(1, 6 * MINUTE);
    expect(durations.estimate(1)).toBe(5 * MINUTE);
  });

  it('follows the last ten analyses, so a faster model shows within a few', () => {
    const durations = new JobDurations();
    for (let i = 0; i < 10; i++) durations.record(1, 10 * MINUTE);
    for (let i = 0; i < 6; i++) durations.record(1, 2 * MINUTE);

    expect(durations.estimate(1)).toBe(2 * MINUTE);
  });

  it('ignores a duration that is no time at all', () => {
    const durations = new JobDurations();
    durations.record(1, 0);
    durations.record(1, Number.NaN);
    expect(durations.estimate(1)).toBeNull();
  });
});
