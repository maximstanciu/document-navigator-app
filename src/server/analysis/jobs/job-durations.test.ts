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

  it('estimates a job by the median of the analyses of its own volume', () => {
    // Letters take 1 minute a page with the fixed part; long PDFs read slower: 3 minutes a page.
    const durations = new JobDurations();
    for (let i = 0; i < 10; i++) durations.record(1, 2 * MINUTE);
    durations.record(20, 60 * MINUTE);
    durations.record(20, 63 * MINUTE);
    durations.record(20, 70 * MINUTE);
    for (let i = 0; i < 3; i++) durations.record(2, 3 * MINUTE);

    // Not the median of every page (1 minute), which would say 21 minutes.
    expect(durations.estimate(20)).toBe(63 * MINUTE);
    // The same class (17–32 pages), scaled to its pages: 3 minutes a page over 18 + 1.
    expect(durations.estimate(18)).toBe(57 * MINUTE);
    expect(durations.estimate(1)).toBe(2 * MINUTE);
    expect(durations.estimate(2)).toBe(3 * MINUTE);
  });

  it('borrows from the closest volumes while its own has few analyses', () => {
    const durations = new JobDurations();
    durations.record(1, 2 * MINUTE);
    for (let i = 0; i < 4; i++) durations.record(9, 30 * MINUTE);
    durations.record(49, 200 * MINUTE);

    // One 1-page analysis and four of 9 pages, the five closest to 1 page: 3 minutes a page.
    expect(durations.estimate(1)).toBe(6 * MINUTE);
    // The 50-page one and the four of 9 pages, 4 and 3 minutes a page: the median is 3.
    expect(durations.estimate(49)).toBe(150 * MINUTE);
  });

  it('forgets analyses beyond the last fifty', () => {
    const durations = new JobDurations();
    durations.record(30, 31 * 10 * MINUTE);
    for (let i = 0; i < 50; i++) durations.record(1, 2 * MINUTE);

    expect(durations.estimate(30)).toBe(31 * MINUTE);
  });

  it('ignores a duration that is no time at all', () => {
    const durations = new JobDurations();
    durations.record(1, 0);
    durations.record(1, Number.NaN);
    expect(durations.estimate(1)).toBeNull();
  });
});
