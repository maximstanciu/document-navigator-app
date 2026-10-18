// Dates in the user's interface language via Intl (AGENTS.md → Strings).

/** A moment in time (ISO 8601 timestamp), shown in the device's time zone. */
export function formatTimestampDate(isoTimestamp: string, language: string): string {
  return new Intl.DateTimeFormat(language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(isoTimestamp));
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
