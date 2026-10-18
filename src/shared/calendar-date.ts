// Calendar dates as `YYYY-MM-DD` strings, without a time zone (SPEC §6.1: `dueDate`). Such strings
// compare correctly as text, so ranges need no Date objects.

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function isLeapYear(year: number) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number) {
  return month === 2 && isLeapYear(year)
    ? 29
    : [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

function format(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `YYYY-MM-DD` that exists in the calendar: 2028-02-29 does, 2026-02-30 doesn't. */
export function isCalendarDate(value: unknown): value is string {
  const match = typeof value === 'string' ? CALENDAR_DATE.exec(value) : null;
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  return year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

/** `HH:mm`, 24-hour. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && CLOCK_TIME.test(value);
}

/** The same day `years` later (or earlier); February 29 becomes the 28th in a common year. */
export function addYears(date: string, years: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const target = year + years;
  return format(target, month, Math.min(day, daysInMonth(target, month)));
}
