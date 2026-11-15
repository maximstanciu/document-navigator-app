import {
  formatCalendarDate,
  formatCalendarWeekday,
  formatClockTime,
  formatDateTile,
  formatFileSize,
  formatShortCalendarDate,
  formatTimestampDate,
} from './format';

describe('date formatting', () => {
  it('formats in the interface language', () => {
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'ru')).toMatch(/17 окт/);
    expect(formatTimestampDate('2026-10-17T12:00:00Z', 'en')).toMatch(/Oct 17/);
  });

  it('keeps calendar dates on their day in any time zone', () => {
    expect(formatCalendarDate('2026-10-31', 'ru')).toMatch(/^31 /);
    expect(formatCalendarDate('2026-01-01', 'en')).toMatch(/Jan 1, 2026/);
  });

  it('splits a calendar date into the day and short month of a date tile', () => {
    expect(formatDateTile('2026-11-16', 'en')).toEqual({ day: '16', month: 'Nov' });
    expect(formatDateTile('2026-01-01', 'ru')).toEqual({
      day: '1',
      month: expect.stringMatching(/^янв/),
    });
  });

  it('leaves out the year of a date in the current year', () => {
    expect(formatShortCalendarDate('2026-11-27', '2026-11-14', 'en')).toBe('Nov 27');
    expect(formatShortCalendarDate('2026-11-27', '2026-11-14', 'ru')).toMatch(/^27 нояб\.?$/);
    expect(formatShortCalendarDate('2027-01-03', '2026-11-14', 'en')).toBe('Jan 3, 2027');
  });

  it('names the weekday of a calendar date in any time zone', () => {
    expect(formatCalendarWeekday('2026-11-16', 'en')).toBe('Mon');
    expect(formatCalendarWeekday('2026-11-16', 'ru')).toBe('пн');
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
