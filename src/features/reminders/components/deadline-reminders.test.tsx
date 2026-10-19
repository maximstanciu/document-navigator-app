/** @jest-environment ./src/test/time-zone-environment.js */
import { focusManager, useQuery, type QueryClient } from '@tanstack/react-query';
import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { NewDeadline } from '@/lib/db/deadlines-repository';
import { dbKeys, localQueryDefaults } from '@/lib/db/query-keys';
import { getRepositories, setRepositories, type Repositories } from '@/lib/db/repositories';
import {
  fakeNotifications,
  openNotificationSettings,
  requestNotificationPermission,
} from '@/test/fake-notifications';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';
import { setTimeZone } from '@/test/time-zone';

import { reminderKeys } from '../queries';
import { syncReminders } from '../sync-reminders';
import { DeadlineReminders } from './deadline-reminders';

// Berlin, 2026-10-18 10:00; only `Date` is faked, timers stay real for React and userEvent.
const NOW = new Date('2026-10-18T10:00:00+02:00');
const REAL_TIMERS = [
  'hrtime',
  'nextTick',
  'performance',
  'queueMicrotask',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'requestIdleCallback',
  'cancelIdleCallback',
  'setImmediate',
  'clearImmediate',
  'setInterval',
  'clearInterval',
  'setTimeout',
  'clearTimeout',
] as const;

let repositories: Repositories;

beforeEach(async () => {
  setTimeZone('Europe/Berlin');
  jest.useFakeTimers({ now: NOW, doNotFake: [...REAL_TIMERS] });
  ({ repositories } = await installTestRepositories());
  await repositories.documents.create({
    id: 'doc-1',
    title: 'Electricity bill',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 10,
  });
});

afterEach(() => {
  jest.useRealTimers();
  setRepositories(null);
});

/** The deadline as the card gets it: read again whenever deadlines change. */
function DeadlineFromDatabase({ id }: { id: string }) {
  const { data } = useQuery({
    queryKey: dbKeys.deadlines.detail(id),
    queryFn: () => getRepositories().deadlines.get(id),
    ...localQueryDefaults,
  });
  return data ? <DeadlineReminders deadline={data} /> : null;
}

async function renderDeadline(overrides: Partial<NewDeadline> = {}) {
  await repositories.deadlines.insertMany([
    {
      id: 'pay',
      documentId: 'doc-1',
      kind: 'payment',
      description: 'Pay the electricity bill',
      dueDate: '2026-11-20',
      dateSource: 'explicit',
      confidence: 'high',
      ...overrides,
    },
  ]);
  return renderWithProviders(<DeadlineFromDatabase id="pay" />);
}

/** Once the permission and the settings are read, the row has rendered what it will. */
async function waitForSettled(queryClient: QueryClient) {
  for (const queryKey of [reminderKeys.permission(), dbKeys.settings.all()]) {
    await waitFor(() => expect(queryClient.getQueryState(queryKey)?.status).toBe('success'));
  }
}

const REMINDERS = 'Reminders: Nov 13, 09:00 AM · Nov 19, 09:00 AM · Nov 20, 09:00 AM';

describe('DeadlineReminders', () => {
  it('shows when the reminders come, and turns them off for this deadline (REM-3)', async () => {
    fakeNotifications.permission = 'granted';
    const user = userEvent.setup();
    await renderDeadline();
    await syncReminders();

    expect(await screen.findByText(REMINDERS)).toBeOnTheScreen();
    await user.press(
      screen.getByRole('button', { name: "Don't remind about the deadline on Nov 20, 2026" })
    );

    expect(
      await screen.findByRole('button', { name: 'Remind me about the deadline on Nov 20, 2026' })
    ).toBeOnTheScreen();
    expect(screen.queryByText(REMINDERS)).not.toBeOnTheScreen();
    expect((await repositories.deadlines.get('pay'))?.reminderOffsetsDays).toEqual([]);
    await waitFor(() => expect(fakeNotifications.scheduled.size).toBe(0));
  });

  it('lists only the reminders still ahead', async () => {
    fakeNotifications.permission = 'granted';

    await renderDeadline({ dueDate: '2026-10-20' });

    expect(
      await screen.findByText('Reminders: Oct 19, 09:00 AM · Oct 20, 09:00 AM')
    ).toBeOnTheScreen();
  });

  it('asks for the permission only when «Remind me» is pressed, then schedules (REM-5)', async () => {
    fakeNotifications.permission = 'undetermined';
    const user = userEvent.setup();
    await renderDeadline();

    const remind = await screen.findByRole('button', {
      name: 'Remind me about the deadline on Nov 20, 2026',
    });
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    await user.press(remind);

    expect(await screen.findByText(REMINDERS)).toBeOnTheScreen();
    expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(fakeNotifications.scheduled.size).toBe(3));
  });

  it('explains how to allow notifications when they are denied (REM-5)', async () => {
    fakeNotifications.permission = 'undetermined';
    fakeNotifications.answer = 'denied';
    const user = userEvent.setup();
    await renderDeadline();

    await user.press(
      await screen.findByRole('button', { name: 'Remind me about the deadline on Nov 20, 2026' })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Notifications are off for this app. To get reminders, allow them in your phone's settings."
    );
    await user.press(screen.getByRole('button', { name: 'Open settings' }));
    expect(openNotificationSettings).toHaveBeenCalledTimes(1);
    expect(fakeNotifications.scheduled.size).toBe(0);
  });

  it('drops the explanation once notifications are allowed in system settings', async () => {
    fakeNotifications.permission = 'undetermined';
    fakeNotifications.answer = 'denied';
    const user = userEvent.setup();
    await renderDeadline();
    await user.press(
      await screen.findByRole('button', { name: 'Remind me about the deadline on Nov 20, 2026' })
    );
    await screen.findByRole('alert');

    // Allowed in system settings; back in the app, the permission is read again.
    fakeNotifications.permission = 'granted';
    await act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    expect(await screen.findByText(REMINDERS)).toBeOnTheScreen();
    await user.press(
      screen.getByRole('button', { name: "Don't remind about the deadline on Nov 20, 2026" })
    );

    expect(
      await screen.findByRole('button', { name: 'Remind me about the deadline on Nov 20, 2026' })
    ).toBeOnTheScreen();
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
  });

  it('turns the reminders of a deadline back on without asking again', async () => {
    fakeNotifications.permission = 'granted';
    const user = userEvent.setup();
    await renderDeadline({ reminderOffsetsDays: [] });

    await user.press(
      await screen.findByRole('button', { name: 'Remind me about the deadline on Nov 20, 2026' })
    );

    expect(await screen.findByText(REMINDERS)).toBeOnTheScreen();
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect((await repositories.deadlines.get('pay'))?.reminderOffsetsDays).toBeNull();
  });

  it('says so when the change fails', async () => {
    fakeNotifications.permission = 'granted';
    const user = userEvent.setup();
    await renderDeadline();
    jest.spyOn(repositories.deadlines, 'update').mockRejectedValueOnce(new Error('disk full'));

    await user.press(
      await screen.findByRole('button', { name: "Don't remind about the deadline on Nov 20, 2026" })
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't change the reminders. Try again."
    );
  });

  it.each([
    ['done', { status: 'done' }],
    ['not relevant', { status: 'dismissed' }],
    ['overdue', { dueDate: '2026-10-17' }],
    ['due today after the reminder time', { dueDate: '2026-10-18' }],
  ] as const)('shows nothing for a deadline %s', async (_case, overrides) => {
    fakeNotifications.permission = 'granted';

    const { queryClient } = await renderDeadline(overrides);
    await waitForSettled(queryClient);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
    expect(screen.queryByText(/^Reminders/)).not.toBeOnTheScreen();
  });

  it('shows nothing without notifications (web)', async () => {
    const { queryClient } = await renderDeadline();
    await waitForSettled(queryClient);

    expect(screen.queryByRole('button')).not.toBeOnTheScreen();
  });
});
