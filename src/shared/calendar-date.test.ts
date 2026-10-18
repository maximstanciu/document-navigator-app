import { addYears, isCalendarDate, isClockTime } from './calendar-date';

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
