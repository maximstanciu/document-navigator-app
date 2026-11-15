import { etaOf } from './eta';

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
    // The panel's clock ticks every 15 s; the server said «past the estimate» since.
    expect(etaOf({ endsAt: NOW, checkedAt: NOW }, NOW - 10_000)).toBe('overdue');
    expect(etaOf({ endsAt: NOW + 7 * 60_000, checkedAt: NOW }, NOW - 14_000)).toEqual({
      unit: 'minutes',
      count: 7,
    });
  });
});
