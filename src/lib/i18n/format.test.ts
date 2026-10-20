import { formatCalendarDate, formatClockTime, formatFileSize, formatTimestampDate } from './format';

describe('date formatting', () => {
  it('formats in the interface language', () => {
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'ru')).toMatch(/17 окт/);
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'en')).toMatch(/Oct 17/);
  });

  it('keeps calendar dates on their day in any time zone', () => {
    expect(formatCalendarDate('2026-10-31', 'ru')).toMatch(/^31 /);
    expect(formatCalendarDate('2026-01-01', 'en')).toMatch(/Jan 1, 2026/);
  });

  it('shows a time of day as it is, whatever the time zone', () => {
    expect(formatClockTime('09:05', 'ru')).toBe('09:05');
    expect(formatClockTime('18:30', 'en')).toMatch(/^06:30\sPM$/);
  });
});

describe('file size formatting', () => {
  it('shows whole kilobytes below a megabyte, never zero', () => {
    expect(formatFileSize(300 * 1024, 'en')).toEqual({ unit: 'kb', value: '300' });
    expect(formatFileSize(100, 'en')).toEqual({ unit: 'kb', value: '1' });
  });

  it('shows megabytes with one decimal in the interface language', () => {
    expect(formatFileSize(1.55 * 1024 * 1024, 'en')).toEqual({ unit: 'mb', value: '1.6' });
    expect(formatFileSize(1.55 * 1024 * 1024, 'ru')).toEqual({ unit: 'mb', value: '1,6' });
    expect(formatFileSize(20 * 1024 * 1024, 'ru')).toEqual({ unit: 'mb', value: '20' });
  });
});
