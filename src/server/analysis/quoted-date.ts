import { isCalendarDate } from '@/shared/calendar-date';

/**
 * Month names as documents write them, by month: Portuguese, German, English, Russian and
 * Ukrainian. The Portuguese short forms `set` and `out` are left out: they are English words.
 */
const MONTH_NAMES: readonly (readonly string[])[] = [
  ['janeiro', 'januar', 'january', 'jan', 'января', 'січня'],
  ['fevereiro', 'fev', 'februar', 'february', 'feb', 'февраля', 'лютого'],
  ['março', 'marco', 'märz', 'maerz', 'march', 'mär', 'mar', 'марта', 'березня'],
  ['abril', 'abr', 'april', 'apr', 'апреля', 'квітня'],
  ['maio', 'mai', 'may', 'мая', 'травня'],
  ['junho', 'juni', 'june', 'jun', 'июня', 'червня'],
  ['julho', 'juli', 'july', 'jul', 'июля', 'липня'],
  ['agosto', 'ago', 'august', 'aug', 'августа', 'серпня'],
  ['setembro', 'september', 'sept', 'sep', 'сентября', 'вересня'],
  ['outubro', 'oktober', 'october', 'okt', 'oct', 'октября', 'жовтня'],
  ['novembro', 'november', 'nov', 'ноября', 'листопада'],
  ['dezembro', 'dezember', 'december', 'dez', 'dec', 'декабря', 'грудня'],
];

/**
 * Whether the quote writes out this calendar date (SPEC §7.4, rule 3): `31.12.2026`, `31.12.26`,
 * `31/12/2026`, `2026-12-31`, `31.12.` without a year, or with the month as a word in Portuguese,
 * German, English, Russian or Ukrainian («31 de dezembro de 2026», «31. Dezember 2026»,
 * «December 31, 2026», «31 декабря»). A year
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
  const yearAfter = `(?:,? (?:de )?(\\d{4})(?!\\d))?`;
  const worded = [
    new RegExp(`(?<!\\d)${ordinal}\\.? (?:of |de )?${name}${yearAfter}`, 'gu'),
    new RegExp(`${name} ${ordinal}${yearAfter}`, 'gu'),
  ];
  return worded.some((pattern) =>
    [...text.matchAll(pattern)].some(
      ([, written]) => written === undefined || Number(written) === year
    )
  );
}
