// Test-only: the calendar adapter (`@/features/deadlines/calendar`) over an in-memory OS. Every
// test gets it (src/test/setup-native-modules.ts) without a calendar, as on web; a test that needs
// one sets `fakeCalendar.available`.
import type { CalendarEventDraft, CalendarFormResult } from '@/features/deadlines/calendar';

export type { CalendarEventDraft, CalendarFormResult };

export const fakeCalendar = {
  /** What `isCalendarAvailable()` reports. */
  available: false,
  /** What the next form reports; `opened` unless a test needs a failure. */
  result: 'opened' as CalendarFormResult,
  /** Thrown by the next form instead of a result, like an unexpected native error. */
  error: null as Error | null,
  /** The events the forms were opened with, in order. */
  opened: [] as CalendarEventDraft[],
};

export const isCalendarAvailable = jest.fn(() => fakeCalendar.available);

export const openCalendarEventForm = jest.fn(
  async (event: CalendarEventDraft): Promise<CalendarFormResult> => {
    if (fakeCalendar.error) throw fakeCalendar.error;
    if (fakeCalendar.result === 'opened') fakeCalendar.opened.push(event);
    return fakeCalendar.result;
  }
);

export const openCalendarSettings = jest.fn(async () => {});

/** A fresh OS without a calendar and clean call records; runs before every test. */
export function resetFakeCalendar() {
  fakeCalendar.available = false;
  fakeCalendar.result = 'opened';
  fakeCalendar.error = null;
  fakeCalendar.opened = [];
  for (const fn of [isCalendarAvailable, openCalendarEventForm, openCalendarSettings]) {
    fn.mockClear();
  }
}
