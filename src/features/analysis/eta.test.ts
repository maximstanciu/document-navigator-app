import { etaOf, progressOf } from './eta';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const in_ = (seconds: number) => etaOf({ endsAt: NOW + seconds * 1000, checkedAt: NOW }, NOW);

describe('etaOf', () => {
  it('has nothing to say without an estimate', () => {
    expect(etaOf({ endsAt: null, checkedAt: NOW }, NOW)).toBeNull();
  });

  it('counts whole minutes, never fewer than one', () => {
    expect(in_(1)).toEqual({ unit: 'minutes', count: 1 });
    expect(in_(89)).toEqual({ unit: 'minutes', count: 1 });
    expect(in_(91)).toEqual({ unit: 'minutes', count: 2 });
    expect(in_(7 * 60 + 2)).toEqual({ unit: 'minutes', count: 7 });
    expect(in_(59 * 60)).toEqual({ unit: 'minutes', count: 59 });
  });

  it('counts whole hours from an hour on, as a 50-page PDF on a CPU takes', () => {
    expect(in_(60 * 60)).toEqual({ unit: 'hours', count: 1 });
    expect(in_(89 * 60)).toEqual({ unit: 'hours', count: 1 });
    expect(in_(150 * 60)).toEqual({ unit: 'hours', count: 3 });
  });

  it('is overdue once the estimate has passed', () => {
    expect(in_(0)).toBe('overdue');
    expect(in_(-120)).toBe('overdue');
    expect(etaOf({ endsAt: NOW + 60_000, checkedAt: NOW }, NOW + 61_000)).toBe('overdue');
  });

  it('counts from the check when the clock was read before it', () => {
    // The panel's clock ticks every 5 s; the server said «past the estimate» since.
    expect(etaOf({ endsAt: NOW, checkedAt: NOW }, NOW - 10_000)).toBe('overdue');
    expect(etaOf({ endsAt: NOW + 7 * 60_000, checkedAt: NOW }, NOW - 14_000)).toEqual({
      unit: 'minutes',
      count: 7,
    });
  });
});

describe('progressOf', () => {
  /** Accepted 2 minutes before the check, 8 minutes left at it: 10 minutes in all. */
  const job = { startedAt: NOW - 2 * 60_000, endsAt: NOW + 8 * 60_000, checkedAt: NOW };

  it('fills as the minutes left count down', () => {
    expect(progressOf(job, NOW)).toBeCloseTo(0.2);
    expect(progressOf(job, NOW + 3 * 60_000)).toBeCloseTo(0.5);
    expect(progressOf(job, NOW + 8 * 60_000 - 6_000)).toBeCloseTo(0.99);
  });

  it('starts empty for a job just accepted', () => {
    expect(progressOf({ startedAt: NOW, endsAt: NOW + 60_000, checkedAt: NOW }, NOW)).toBe(0);
  });

  it('counts from the check when the clock was read before it', () => {
    expect(progressOf(job, NOW - 14_000)).toBeCloseTo(0.2);
  });

  it('is unknown without an estimate, without the start, and past the estimate', () => {
    expect(progressOf({ ...job, endsAt: null }, NOW)).toBeNull();
    // A server older than SPEC v0.55 doesn't say when it accepted the job.
    expect(progressOf({ ...job, startedAt: null }, NOW)).toBeNull();
    expect(progressOf(job, NOW + 8 * 60_000)).toBeNull();
    expect(progressOf({ ...job, endsAt: NOW }, NOW)).toBeNull();
  });
});
