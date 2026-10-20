import {
  addDays,
  addMonths,
  addYears,
  clockTime,
  daysBetween,
  endOfPeriod,
  isCalendarDate,
  isClockTime,
  localCalendarDate,
  localNoon,
  todayAt,
} from './calendar-date';

describe('isCalendarDate', () => {
  it.each(['2026-10-18', '2028-02-29', '2000-02-29', '2026-12-31', '0001-01-01'])(
    'accepts %s',
    (value) => expect(isCalendarDate(value)).toBe(true)
  );

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-01',
    '18.10.2026',
    '2026-10-18T00:00',
    '',
    null,
    20261018,
  ])('rejects %p', (value) => expect(isCalendarDate(value)).toBe(false));
});

describe('isClockTime', () => {
  it.each(['00:00', '09:30', '23:59'])('accepts %s', (value) =>
    expect(isClockTime(value)).toBe(true)
  );

  it.each(['24:00', '9:30', '09:60', '09:30:00', '', null])('rejects %p', (value) =>
    expect(isClockTime(value)).toBe(false)
  );
});

describe('addYears', () => {
  it.each([
    ['2026-10-18', 10, '2036-10-18'],
    ['2026-10-18', -1, '2025-10-18'],
    ['2028-02-29', 1, '2029-02-28'],
    ['2028-02-29', -1, '2027-02-28'],
    ['2028-02-29', 4, '2032-02-29'],
    ['2026-01-31', 1, '2027-01-31'],
  ])('%s %+d years is %s', (date, years, expected) => {
    expect(addYears(date, years)).toBe(expected);
  });
});

describe('addMonths', () => {
  it.each([
    ['2026-10-09', 1, '2026-11-09'],
    ['2026-10-09', -1, '2026-09-09'],
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-31', 1, '2026-04-30'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2027-01-31', -3, '2026-10-31'],
    ['2026-11-30', 3, '2027-02-28'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2027-01-15', -1, '2026-12-15'],
    ['2026-05-15', 24, '2028-05-15'],
  ])('%s %+d months is %s', (date, months, expected) => {
    expect(addMonths(date, months)).toBe(expected);
  });
});

describe('endOfPeriod', () => {
  it.each([
    ['2026-11-09', 'month', '2026-11-30'],
    ['2028-02-03', 'month', '2028-02-29'],
    ['2026-02-28', 'month', '2026-02-28'],
    ['2026-01-01', 'quarter', '2026-03-31'],
    ['2026-05-20', 'quarter', '2026-06-30'],
    ['2026-09-30', 'quarter', '2026-09-30'],
    ['2026-11-09', 'quarter', '2026-12-31'],
    ['2026-03-04', 'year', '2026-12-31'],
  ] as const)('%s, end of its %s: %s', (date, period, expected) => {
    expect(endOfPeriod(date, period)).toBe(expected);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-10-18', 14, '2026-11-01'],
    ['2026-10-18', 0, '2026-10-18'],
    ['2026-10-18', -18, '2026-09-30'],
    ['2026-12-25', 7, '2027-01-01'],
    ['2028-02-28', 1, '2028-02-29'],
    ['2026-02-28', 1, '2026-03-01'],
    ['0050-01-01', 1, '0050-01-02'],
  ])('%s %+d days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected);
  });
});

describe('daysBetween', () => {
  it.each([
    ['2026-10-18', '2026-10-18', 0],
    ['2026-10-18', '2026-10-19', 1],
    ['2026-10-18', '2026-10-15', -3],
    ['2026-10-18', '2027-10-18', 365],
    ['2028-02-01', '2028-03-01', 29],
    // Daylight saving time changes in Europe on 2026-10-25; calendar days don't notice.
    ['2026-10-24', '2026-10-26', 2],
  ])('from %s to %s is %d days', (from, to, expected) => {
    expect(daysBetween(from, to)).toBe(expected);
  });
});

describe('localNoon', () => {
  it.each(['2026-10-25', '2027-03-28', '2028-02-29', '0050-06-15'])(
    'lands on %s and back again',
    (date) => {
      const moment = localNoon(date);
      expect(moment.getHours()).toBe(12);
      expect(localCalendarDate(moment)).toBe(date);
    }
  );
});

describe('todayAt and clockTime', () => {
  it.each(['00:00', '09:00', '09:05', '12:30', '23:59'])(
    'turn %s into a moment and back',
    (time) => {
      const moment = todayAt(time);
      expect(localCalendarDate(moment)).toBe(localCalendarDate(new Date()));
      expect(clockTime(moment)).toBe(time);
    }
  );
});
