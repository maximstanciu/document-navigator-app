import { formatCalendarDate, formatTimestampDate } from './format';

describe('date formatting', () => {
  it('formats in the interface language', () => {
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'ru')).toMatch(/17 окт/);
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'en')).toMatch(/Oct 17/);
  });

  it('keeps calendar dates on their day in any time zone', () => {
    expect(formatCalendarDate('2026-10-31', 'ru')).toMatch(/^31 /);
    expect(formatCalendarDate('2026-01-01', 'en')).toMatch(/Jan 1, 2026/);
  });
});
