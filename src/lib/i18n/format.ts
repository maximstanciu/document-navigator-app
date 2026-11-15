// Dates in the user's interface language via Intl (AGENTS.md → Strings).

/** A moment in time (ISO 8601 timestamp), shown in the device's time zone. */
export function formatTimestampDate(isoTimestamp: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoTimestamp));
}

/** A moment with its time of day in the device's time zone, e.g. when a limit resets (ANL-9). */
export function formatTimestampDateTime(isoTimestamp: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoTimestamp));
}

/**
 * A calendar date (YYYY-MM-DD) split for a date tile: the day of the month and the short month,
 * «16» and «нояб.». In UTC, as `formatCalendarDate`.
 */
export function formatDateTile(isoDate: string, language: string): { day: string; month: string } {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return {
    day: new Intl.DateTimeFormat(language, { day: 'numeric', timeZone: 'UTC' }).format(date),
    month: new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' }).format(date),
  };
}

/** A time of day (`HH:mm`, local), e.g. when reminders come (SET-2): «09:00» or «09:00 AM». */
export function formatClockTime(time: string, language: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(language, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(2000, 0, 1, hours, minutes)));
}

/**
 * A calendar date (YYYY-MM-DD, no time zone), e.g. a document date or a deadline. Formatted in UTC so
 * it never shifts by a day in time zones west of UTC.
 */
export function formatCalendarDate(isoDate: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * A calendar date (YYYY-MM-DD) as short as it can be told apart: «27 нояб.» or «Nov 27» in the year
 * of `today`, with the year in another: «3 янв. 2027 г.». In UTC, as `formatCalendarDate`.
 */
export function formatShortCalendarDate(isoDate: string, today: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    year: isoDate.slice(0, 4) === today.slice(0, 4) ? undefined : 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${isoDate}T00:00:00Z`));
}

/** The short weekday of a calendar date (YYYY-MM-DD): «пн» or «Mon». In UTC, as `formatCalendarDate`. */
export function formatCalendarWeekday(isoDate: string, language: string): string {
  return new Intl.DateTimeFormat(language, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(`${isoDate}T00:00:00Z`)
  );
}

/**
 * A file size for the `fileSize.kb` / `fileSize.mb` strings: whole kilobytes below 1 MB, megabytes
 * with one decimal above. The unit comes from the dictionaries rather than the `unit` style of
 * `Intl.NumberFormat`, which Hermes wasn't checked for (spike 0.7).
 */
export function formatFileSize(
  bytes: number,
  language: string
): { unit: 'kb' | 'mb'; value: string } {
  const megabytes = bytes / (1024 * 1024);
  if (megabytes < 1) {
    const kilobytes = Math.max(1, Math.round(bytes / 1024));
    return { unit: 'kb', value: new Intl.NumberFormat(language).format(kilobytes) };
  }
  const value = new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(megabytes);
  return { unit: 'mb', value };
}
