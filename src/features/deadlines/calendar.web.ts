import type { CalendarEventDraft, CalendarFormResult } from './calendar';

export type { CalendarEventDraft, CalendarFormResult } from './calendar';

// Web is a development preview without a system calendar: «Add to calendar» is not offered.

export function isCalendarAvailable(): boolean {
  return false;
}

/** Never called: the button is hidden. */
export async function openCalendarEventForm(
  _event: CalendarEventDraft
): Promise<CalendarFormResult> {
  return 'unavailable';
}

export async function openCalendarSettings(): Promise<void> {}
