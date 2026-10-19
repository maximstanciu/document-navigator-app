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

/**
 * The same day `months` later (or earlier), or the last day of the month that has no such day:
 * January 31 + 1 month is February 28 (29 in a leap year).
 */
export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split('-').map(Number);
  const index = year * 12 + month - 1 + months;
  const targetYear = Math.floor(index / 12);
  const targetMonth = index - targetYear * 12 + 1;
  return format(targetYear, targetMonth, Math.min(day, daysInMonth(targetYear, targetMonth)));
}

/** The same day `years` later (or earlier); February 29 becomes the 28th in a common year. */
export function addYears(date: string, years: number): string {
  return addMonths(date, years * 12);
}

/** The last day of the month, quarter or year that `date` is in. */
export function endOfPeriod(date: string, period: 'month' | 'quarter' | 'year'): string {
  const [year, month] = date.split('-').map(Number);
  const lastMonth =
    period === 'month' ? month : period === 'quarter' ? Math.ceil(month / 3) * 3 : 12;
  return format(year, lastMonth, daysInMonth(year, lastMonth));
}

/** Midnight UTC of `date`: a calendar day as an instant, for day arithmetic without time zones. */
function utcMidnight(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const moment = new Date(0);
  // Not Date.UTC(), which reads years below 100 as 19xx.
  moment.setUTCFullYear(year, month - 1, day);
  return moment;
}

/** The date `days` calendar days later (or earlier), across months and years. */
export function addDays(date: string, days: number): string {
  const moment = utcMidnight(date);
  moment.setUTCDate(moment.getUTCDate() + days);
  return format(moment.getUTCFullYear(), moment.getUTCMonth() + 1, moment.getUTCDate());
}

/** Calendar days from `from` to `to`: negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((utcMidnight(to).getTime() - utcMidnight(from).getTime()) / 86_400_000);
}

/**
 * Noon of `date` in the runtime's time zone, for pickers that take a `Date`: noon stays on the same
 * calendar day whatever the daylight saving time does that night.
 */
export function localNoon(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  const moment = new Date(2000, 0, 1, 12);
  moment.setFullYear(year, month - 1, day);
  return moment;
}

/** The calendar date of `moment` in the runtime's time zone: on the client, the device's "today". */
export function localCalendarDate(moment: Date): string {
  return format(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());
}
