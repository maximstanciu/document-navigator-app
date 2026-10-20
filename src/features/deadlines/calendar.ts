import { getDefaultCalendarSync, requestCalendarPermissions } from 'expo-calendar';
import { startActivityAsync } from 'expo-intent-launcher';
import { Linking } from 'react-native';

// Adapter for «Add to calendar» (REM-10): the rest of the app sees these functions, and tests mock
// this module. Android opens the calendar's own event form with an Intent and needs no permission;
// iOS shows the EventKit form with write-only access. The web stub is calendar.web.ts.

/** A deadline as the system event form gets it, already in the interface language. */
export type CalendarEventDraft = {
  title: string;
  /** Calendar date `YYYY-MM-DD`. */
  date: string;
  /** Local `HH:mm`; without it the event is all-day. */
  time: string | null;
  notes: string;
};

/**
 * `opened`: the form was shown. Whether the person saved the event can't be known on either
 * platform (Android always reports «done»), so nothing may claim it was added (REM-10).
 * `no-calendar-app`: Android has no app for the form. `denied`: iOS calendar access is off.
 * `unavailable`: no calendar on this platform (web).
 */
export type CalendarFormResult = 'opened' | 'no-calendar-app' | 'denied' | 'unavailable';

/** A timed event takes this long; the form lets the person change it. */
const TIMED_EVENT_MINUTES = 30;

/**
 * When the event starts and ends in the device's time zone: from the due time, or the whole day,
 * which ends at the next midnight (exclusive, as the Android calendar provider stores it).
 */
export function eventWindow(event: Pick<CalendarEventDraft, 'date' | 'time'>) {
  const [year, month, day] = event.date.split('-').map(Number);
  if (event.time) {
    const [hours, minutes] = event.time.split(':').map(Number);
    const start = new Date(year, month - 1, day, hours, minutes);
    return {
      allDay: false,
      start,
      end: new Date(start.getTime() + TIMED_EVENT_MINUTES * 60_000),
    };
  }
  // The date arithmetic of `Date` keeps local midnight across a daylight saving change.
  return {
    allDay: true,
    start: new Date(year, month - 1, day),
    end: new Date(year, month - 1, day + 1),
  };
}

const CALENDAR_EVENTS_URI = 'content://com.android.calendar/events';

/**
 * Android: `ACTION_INSERT` on the calendar provider's events (spike 0.7). The extras are those of
 * `CalendarContract`; the promise settles once the person leaves the form, whatever they did.
 */
export async function openAndroidEventForm(event: CalendarEventDraft): Promise<CalendarFormResult> {
  const { allDay, start, end } = eventWindow(event);
  try {
    await startActivityAsync('android.intent.action.INSERT', {
      data: CALENDAR_EVENTS_URI,
      extra: {
        title: event.title,
        description: event.notes,
        beginTime: start.getTime(),
        endTime: end.getTime(),
        allDay,
      },
    });
    return 'opened';
  } catch (error) {
    if (String(error).includes('ActivityNotFoundException')) return 'no-calendar-app';
    throw error;
  }
}

/**
 * iOS: the EventKit form in the default calendar, which with write-only access (iOS 17+) is
 * EventKit's virtual calendar. iOS 16 has no write-only access: expo-calendar asks for full access
 * there, with the `NSCalendarsUsageDescription` text (not yet checked on a device).
 */
export async function openIosEventForm(event: CalendarEventDraft): Promise<CalendarFormResult> {
  const permission = await requestCalendarPermissions(true);
  if (!permission.granted) return 'denied';
  const { allDay, start, end } = eventWindow(event);
  await getDefaultCalendarSync().addEventWithForm({
    title: event.title,
    notes: event.notes,
    startDate: start,
    // EventKit's all-day event ends on its own day; the next midnight would make it two days.
    endDate: allDay ? start : end,
    allDay,
  });
  return 'opened';
}

export function isCalendarAvailable(): boolean {
  return true;
}

export function openCalendarEventForm(event: CalendarEventDraft): Promise<CalendarFormResult> {
  return process.env.EXPO_OS === 'android' ? openAndroidEventForm(event) : openIosEventForm(event);
}

/** The app's page in system settings, where calendar access is turned back on (iOS). */
export async function openCalendarSettings(): Promise<void> {
  await Linking.openSettings();
}
