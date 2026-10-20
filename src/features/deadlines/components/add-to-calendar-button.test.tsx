import { screen, userEvent, waitFor } from '@testing-library/react-native';

import type { DeadlineRecord } from '@/lib/db/types';
import { i18n } from '@/lib/i18n/i18n';
import { formatCalendarDate } from '@/lib/i18n/format';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import {
  fakeCalendar,
  openCalendarEventForm,
  openCalendarSettings,
  type CalendarFormResult,
} from '@/test/fake-calendar';
import { renderWithProviders } from '@/test/render';

import { AddToCalendarButton } from './add-to-calendar-button';

// Shown or not by the real «today» the button reads.
const today = localCalendarDate(new Date());
const dueDate = addDays(today, 10);
const date = formatCalendarDate(dueDate, 'en');
const label = `Add the deadline “Pay the electricity bill”, ${date}, to your calendar`;

const deadline: DeadlineRecord = {
  id: 'pay',
  documentId: 'bill',
  kind: 'payment',
  description: 'Pay the electricity bill',
  dueDate,
  dueTime: null,
  dateSource: 'explicit',
  originalDate: null,
  sourceQuote: null,
  sourcePage: null,
  computation: null,
  confidence: 'high',
  status: 'open',
  reminderOffsetsDays: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  deletedAt: null,
};

function renderButton(overrides: Partial<DeadlineRecord> = {}) {
  return renderWithProviders(
    <AddToCalendarButton
      deadline={{ ...deadline, ...overrides }}
      actions={[]}
      documentTitle="Electricity bill"
    />
  );
}

beforeEach(() => {
  fakeCalendar.available = true;
});

describe('AddToCalendarButton', () => {
  it('opens the system event form filled in, and claims nothing afterwards (REM-10)', async () => {
    const user = userEvent.setup();
    await renderButton();

    await user.press(screen.getByRole('button', { name: label }));

    expect(fakeCalendar.opened).toEqual([
      {
        title: 'Pay the electricity bill',
        date: dueDate,
        time: null,
        notes: 'Document: Electricity bill',
      },
    ]);
    expect(screen.getByRole('button', { name: label })).toBeEnabled();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(screen.queryByText(/added/i)).not.toBeOnTheScreen();
  });

  it('can’t open a second form while one is open', async () => {
    const user = userEvent.setup();
    let close: (result: CalendarFormResult) => void = () => {};
    openCalendarEventForm.mockImplementationOnce(
      () => new Promise<CalendarFormResult>((resolve) => (close = resolve))
    );
    await renderButton();

    await user.press(screen.getByRole('button', { name: label }));

    expect(screen.getByRole('button', { name: label })).toBeDisabled();
    close('opened');
    await waitFor(() => expect(screen.getByRole('button', { name: label })).toBeEnabled());
  });

  it('says so when the phone has no calendar app', async () => {
    fakeCalendar.result = 'no-calendar-app';
    const user = userEvent.setup();
    await renderButton();

    await user.press(screen.getByRole('button', { name: label }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'There is no calendar app on this phone. Install one to add deadlines to a calendar.'
    );
  });

  it('explains denied calendar access and opens the settings (iOS)', async () => {
    fakeCalendar.result = 'denied';
    const user = userEvent.setup();
    await renderButton();

    await user.press(screen.getByRole('button', { name: label }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/^Calendar access is off/);
    await user.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(openCalendarSettings).toHaveBeenCalledTimes(1);
  });

  it('says so when the form fails to open, and tries again', async () => {
    fakeCalendar.error = new Error('IntentLauncher activity is already started.');
    const user = userEvent.setup();
    await renderButton();

    await user.press(screen.getByRole('button', { name: label }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't open the calendar. Try again."
    );

    fakeCalendar.error = null;
    await user.press(screen.getByRole('button', { name: label }));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    expect(fakeCalendar.opened).toHaveLength(1);
  });

  it('is offered for a deadline due today', async () => {
    await renderButton({ dueDate: today });

    expect(screen.getByRole('button', { name: /^Add the deadline/ })).toBeOnTheScreen();
  });

  it.each([
    ['done', { status: 'done' }],
    ['not relevant', { status: 'dismissed' }],
    ['overdue', { dueDate: addDays(today, -1) }],
  ] as const)('is not offered for a deadline %s', async (_case, overrides) => {
    await renderButton(overrides);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('is not offered without a calendar (web)', async () => {
    fakeCalendar.available = false;
    await renderButton();

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });

  it('speaks Russian', async () => {
    await i18n.changeLanguage('ru');
    await renderButton();

    expect(
      screen.getByRole('button', {
        name: `Добавить в календарь срок «Pay the electricity bill», ${formatCalendarDate(dueDate, 'ru')}`,
      })
    ).toHaveTextContent('В календарь');
  });
});
