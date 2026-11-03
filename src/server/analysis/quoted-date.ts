import { isCalendarDate } from '@/shared/calendar-date';

/** Month names as documents write them, by month: German, English, Russian and Ukrainian. */
const MONTH_NAMES: readonly (readonly string[])[] = [
  ['januar', 'january', 'jan', 'января', 'січня'],
  ['februar', 'february', 'feb', 'февраля', 'лютого'],
  ['märz', 'maerz', 'march', 'mär', 'mar', 'марта', 'березня'],
  ['april', 'apr', 'апреля', 'квітня'],
  ['mai', 'may', 'мая', 'травня'],
  ['juni', 'june', 'jun', 'июня', 'червня'],
  ['juli', 'july', 'jul', 'июля', 'липня'],
  ['august', 'aug', 'августа', 'серпня'],
  ['september', 'sept', 'sep', 'сентября', 'вересня'],
  ['oktober', 'october', 'okt', 'oct', 'октября', 'жовтня'],
  ['november', 'nov', 'ноября', 'листопада'],
  ['dezember', 'december', 'dez', 'dec', 'декабря', 'грудня'],
];

/**
 * Whether the quote writes out this calendar date (SPEC §7.4, rule 3): `31.12.2026`, `31.12.26`,
 * `31/12/2026`, `2026-12-31`, `31.12.` without a year, or with the month as a word in German,
 * English, Russian or Ukrainian («31. Dezember 2026», «December 31, 2026», «31 декабря»). A year
 * the quote gives must be the date's. Day and month in the US order (`12/31/2026`) don't count.
 */
export function quoteWritesDate(quote: string, date: string): boolean {
  if (!isCalendarDate(date)) return false;
  const [year, month, day] = date.split('-').map(Number);
  const text = quote.toLowerCase().replace(/\s+/g, ' ');
  if (text.includes(date)) return true;

  const d = `0?${day}`;
  const m = `0?${month}`;
  const numeric = [
    new RegExp(`(?<!\\d)${d}([./])${m}\\1(?:${year}|${String(year).slice(2)})(?!\\d)`),
    new RegExp(`(?<![\\d.])${d}\\.${m}\\.(?!\\d)`),
  ];
  if (numeric.some((pattern) => pattern.test(text))) return true;

  // The year after a month name is optional, so it is captured and compared.
  const name = `(?<!\\p{L})(?:${MONTH_NAMES[month - 1].join('|')})\\.?(?!\\p{L})`;
  const ordinal = `${d}(?:st|nd|rd|th)?(?!\\d)`;
  const yearAfter = `(?:,? (\\d{4})(?!\\d))?`;
  const worded = [
    new RegExp(`(?<!\\d)${ordinal}\\.? (?:of )?${name}${yearAfter}`, 'gu'),
    new RegExp(`${name} ${ordinal}${yearAfter}`, 'gu'),
  ];
  return worded.some((pattern) =>
    [...text.matchAll(pattern)].some(
      ([, written]) => written === undefined || Number(written) === year
    )
  );
}
