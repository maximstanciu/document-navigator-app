/** @jest-environment ./src/test/time-zone-environment.js */
import { getDefaultCalendarSync, requestCalendarPermissions } from 'expo-calendar';
import { startActivityAsync } from 'expo-intent-launcher';

import { setTimeZone } from '@/test/time-zone';

// Every other test sees the fake calendar (src/test/setup-native-modules.ts); this one tests the
// adapter over mocked libraries.
jest.unmock('./calendar');
jest.mock('expo-intent-launcher', () => ({ startActivityAsync: jest.fn() }));
jest.mock('expo-calendar', () => ({
  requestCalendarPermissions: jest.fn(),
  getDefaultCalendarSync: jest.fn(),
}));

const { eventWindow, openAndroidEventForm, openIosEventForm } =
  jest.requireActual<typeof import('./calendar')>('./calendar');

const startActivity = jest.mocked(startActivityAsync);
const requestPermission = jest.mocked(requestCalendarPermissions);
const addEventWithForm = jest.fn();

beforeEach(() => {
  setTimeZone('Europe/Berlin');
  startActivity.mockReset().mockResolvedValue({ resultCode: 0 });
  requestPermission.mockReset();
  addEventWithForm.mockReset().mockResolvedValue({ action: 'canceled', id: null });
  jest.mocked(getDefaultCalendarSync).mockReturnValue({ addEventWithForm } as never);
});

const event = {
  title: 'Pay the electricity bill',
  date: '2026-11-20',
  time: null,
  notes: 'Document: Electricity bill',
};

describe('eventWindow', () => {
  it('makes a deadline without a time an all-day event in the device’s time zone', () => {
    const { allDay, start, end } = eventWindow(event);

    expect(allDay).toBe(true);
    expect(start.toISOString()).toBe('2026-11-19T23:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-20T23:00:00.000Z');
  });

  it('keeps local midnight across the daylight saving change', () => {
    // Berlin goes from UTC+2 to UTC+1 in the night after October 25, 2026.
    const { start, end } = eventWindow({ date: '2026-10-25', time: null });

    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });

  it('starts at the due time and lasts half an hour', () => {
    const { allDay, start, end } = eventWindow({ date: '2026-11-20', time: '09:30' });

    expect(allDay).toBe(false);
    expect(start.toISOString()).toBe('2026-11-20T08:30:00.000Z');
    expect(end.toISOString()).toBe('2026-11-20T09:00:00.000Z');
  });
});

describe('openAndroidEventForm', () => {
  it('opens the calendar’s event form with ACTION_INSERT, filled in (REM-10)', async () => {
    await expect(openAndroidEventForm(event)).resolves.toBe('opened');

    expect(startActivity).toHaveBeenCalledWith('android.intent.action.INSERT', {
      data: 'content://com.android.calendar/events',
      extra: {
        title: 'Pay the electricity bill',
        description: 'Document: Electricity bill',
        beginTime: Date.parse('2026-11-20T00:00:00+01:00'),
        endTime: Date.parse('2026-11-21T00:00:00+01:00'),
        allDay: true,
      },
    });
  });

  it('passes a due time as the start of a timed event', async () => {
    await openAndroidEventForm({ ...event, time: '14:00' });

    expect(startActivity.mock.calls[0][1]?.extra).toMatchObject({
      beginTime: Date.parse('2026-11-20T14:00:00+01:00'),
      endTime: Date.parse('2026-11-20T14:30:00+01:00'),
      allDay: false,
    });
  });

  it('reports a phone without a calendar app', async () => {
    startActivity.mockRejectedValue(
      new Error(
        'android.content.ActivityNotFoundException: No Activity found to handle Intent { act=android.intent.action.INSERT dat=content://com.android.calendar/... }'
      )
    );

    await expect(openAndroidEventForm(event)).resolves.toBe('no-calendar-app');
  });

  it('lets other failures through', async () => {
    startActivity.mockRejectedValue(new Error('IntentLauncher activity is already started.'));

    await expect(openAndroidEventForm(event)).rejects.toThrow('already started');
  });
});

describe('openIosEventForm', () => {
  it('asks for write-only access, then opens the form in the default calendar (REM-10)', async () => {
    requestPermission.mockResolvedValue({ granted: true } as never);

    await expect(openIosEventForm(event)).resolves.toBe('opened');

    expect(requestPermission).toHaveBeenCalledWith(true);
    expect(addEventWithForm).toHaveBeenCalledWith({
      title: 'Pay the electricity bill',
      notes: 'Document: Electricity bill',
      startDate: new Date('2026-11-20T00:00:00+01:00'),
      endDate: new Date('2026-11-20T00:00:00+01:00'),
      allDay: true,
    });
  });

  it('says «opened» whatever the person did in the form', async () => {
    requestPermission.mockResolvedValue({ granted: true } as never);
    addEventWithForm.mockResolvedValue({ action: 'saved', id: 'event-1' });

    await expect(openIosEventForm({ ...event, time: '14:00' })).resolves.toBe('opened');
    expect(addEventWithForm).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: new Date('2026-11-20T14:00:00+01:00'),
        endDate: new Date('2026-11-20T14:30:00+01:00'),
        allDay: false,
      })
    );
  });

  it('reports denied access without opening the form', async () => {
    requestPermission.mockResolvedValue({ granted: false } as never);

    await expect(openIosEventForm(event)).resolves.toBe('denied');
    expect(addEventWithForm).not.toHaveBeenCalled();
  });
});
