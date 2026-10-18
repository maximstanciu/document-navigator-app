import {
  daysBefore,
  nextUtcMidnight,
  secondsUntilNextDay,
  secondsUntilNextHour,
  utcDay,
  utcHour,
} from './utc-time';

const AT = Date.parse('2026-10-18T23:59:30.250Z');

describe('UTC buckets', () => {
  it('names the day and the hour in UTC', () => {
    expect(utcDay(AT)).toBe('2026-10-18');
    expect(utcHour(AT)).toBe('2026-10-18T23');
  });

  it('counts back across months and leap days', () => {
    expect(daysBefore('2026-10-18', 7)).toBe('2026-10-11');
    expect(daysBefore('2028-03-01', 1)).toBe('2028-02-29');
    expect(daysBefore('2027-01-01', 1)).toBe('2026-12-31');
  });

  it('gives the next midnight and the seconds until it, rounded up', () => {
    expect(nextUtcMidnight(AT)).toBe('2026-10-19T00:00:00Z');
    expect(secondsUntilNextDay(AT)).toBe(30);
    expect(secondsUntilNextHour(Date.parse('2026-10-18T10:15:00Z'))).toBe(45 * 60);
  });

  it('never says retry after 0 seconds', () => {
    expect(secondsUntilNextDay(Date.parse('2026-10-19T00:00:00Z'))).toBe(24 * 60 * 60);
    expect(secondsUntilNextHour(Date.parse('2026-10-19T00:59:59.999Z'))).toBe(1);
  });
});
