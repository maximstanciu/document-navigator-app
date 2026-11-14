import { act, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';
import { Text } from 'react-native';

import { NotificationOpener } from '@/features/reminders/components/notification-opener';
import { remindTomorrowAt } from '@/features/reminders/plan-reminders';
import { syncReminders } from '@/features/reminders/sync-reminders';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import { addDays, localCalendarDate } from '@/shared/calendar-date';
import {
  addNotificationOpenedListener,
  clearLastOpenedNotification,
  fakeNotifications,
  type OpenedNotification,
} from '@/test/fake-notifications';
import { createTestProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { clearNotificationOutcome } from '../notification-outcome';
import { DeadlinesScreen } from '../screens/deadlines-screen';
import { DeadlineNotificationActions } from './deadline-notification-actions';

let repositories: Repositories;

// The Deadlines tab groups by the real «today».
const inDays = (days: number) => addDays(localCalendarDate(new Date()), days);

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  fakeNotifications.permission = 'granted';
  await repositories.documents.create({
    id: 'bill',
    title: 'Electricity bill',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 10,
  });
  await repositories.deadlines.insertMany([
    {
      id: 'pay',
      documentId: 'bill',
      kind: 'payment',
      description: 'Pay the electricity bill',
      dueDate: inDays(10),
      dateSource: 'explicit',
      confidence: 'high',
    },
  ]);
});

afterEach(() => {
  setRepositories(null);
  clearNotificationOutcome();
});

const press = (action: 'done' | 'snooze' | 'open', notificationId = 'reminder-1') =>
  ({
    type: 'reminder',
    notificationId,
    documentId: 'bill',
    deadlineId: 'pay',
    action,
  }) satisfies OpenedNotification;

/** The app's root, as in `AppProviders`: the stack, then both notification handlers after it. */
function RootLayout() {
  return (
    <>
      <Stack />
      <NotificationOpener />
      <DeadlineNotificationActions />
    </>
  );
}

function Home() {
  return <Text>Documents</Text>;
}

function DocumentRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Text>Document {id}</Text>;
}

function renderApp(initialUrl = '/') {
  return renderRouter(
    {
      _layout: RootLayout,
      index: Home,
      deadlines: DeadlinesScreen,
      'documents/[id]': DocumentRoute,
    },
    { initialUrl, wrapper: createTestProviders() }
  );
}

const status = async () => (await repositories.deadlines.get('pay'))?.status;
const remindersOfPay = () =>
  fakeNotifications.pending().filter((notification) => notification.data.deadlineId === 'pay');

describe('DeadlineNotificationActions (REM-15)', () => {
  it('closes a deadline on «Done», removes the notification and opens the tab with «Undo»', async () => {
    await syncReminders();
    expect(remindersOfPay()).not.toEqual([]);
    await renderApp();

    await act(async () => fakeNotifications.tap(press('done')));

    expect(await screen.findByText('Done: “Pay the electricity bill”')).toBeOnTheScreen();
    expect(screen).toHavePathname('/deadlines');
    expect(await status()).toBe('done');
    expect(fakeNotifications.dismissed).toEqual(['reminder-1']);
    expect(fakeNotifications.lastOpened).toBeNull();
    await waitFor(() => expect(remindersOfPay()).toEqual([]));

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Undo: “Pay the electricity bill”' }));

    await waitFor(async () => expect(await status()).toBe('open'));
    expect(screen.queryByText('Done: “Pay the electricity bill”')).not.toBeOnTheScreen();
    expect(await screen.findByText('Pay the electricity bill')).toBeOnTheScreen();
    await waitFor(() => expect(remindersOfPay()).not.toEqual([]));
  });

  it('ticks every open action of a deadline, and «Undo» reopens only those (REM-9)', async () => {
    await repositories.actions.insertMany([
      {
        id: 'transfer',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Transfer 84 EUR',
        priority: 'high',
      },
      {
        id: 'reference',
        documentId: 'bill',
        deadlineId: 'pay',
        description: 'Add the number',
        priority: 'medium',
      },
    ]);
    await repositories.actions.setDone('reference', true);
    await renderApp();

    await act(async () => fakeNotifications.tap(press('done')));

    expect(await screen.findByText('Done: “Pay the electricity bill”')).toBeOnTheScreen();
    expect(await status()).toBe('done');
    expect((await repositories.actions.get('transfer'))?.done).toBe(true);

    await userEvent
      .setup()
      .press(screen.getByRole('button', { name: 'Undo: “Pay the electricity bill”' }));

    await waitFor(async () => expect(await status()).toBe('open'));
    expect((await repositories.actions.get('transfer'))?.done).toBe(false);
    expect((await repositories.actions.get('reference'))?.done).toBe(true);
  });

  it('puts the reminder off to tomorrow at the reminder time and says when', async () => {
    await renderApp();

    await act(async () => fakeNotifications.tap(press('snooze')));

    expect(await screen.findByText("I'll remind you tomorrow at 09:00 AM")).toBeOnTheScreen();
    expect(screen).toHavePathname('/deadlines');
    const expected = remindTomorrowAt(new Date(), '09:00');
    expect((await repositories.deadlines.get('pay'))?.snoozedUntil).toBe(expected);
    expect(await status()).toBe('open');
    expect(fakeNotifications.dismissed).toEqual(['reminder-1']);
    await waitFor(() =>
      expect(remindersOfPay().map((notification) => notification.fireAt)).toContain(expected)
    );
  });

  it('says when in Russian', async () => {
    await i18n.changeLanguage('ru');
    await renderApp();

    await act(async () => fakeNotifications.tap(press('snooze')));

    expect(await screen.findByText('Напомню завтра в 09:00')).toBeOnTheScreen();
  });

  it('opens the tab from a document screen too', async () => {
    await renderApp('/documents/bill');
    expect(screen.getByText('Document bill')).toBeOnTheScreen();

    await act(async () => fakeNotifications.tap(press('done')));

    expect(await screen.findByText('Done: “Pay the electricity bill”')).toBeOnTheScreen();
    expect(screen).toHavePathname('/deadlines');
  });

  it('handles the press that launched the app once, also when it is reported twice', async () => {
    fakeNotifications.lastOpened = press('done');
    // At a cold start the OS may also deliver the launching press to the listeners, later: to the
    // opener's and to the handler's, which subscribe in that order.
    const late: ((opened: OpenedNotification) => void)[] = [];
    const capture = (listener: (opened: OpenedNotification) => void) => {
      late.push(listener);
      return () => {};
    };
    addNotificationOpenedListener.mockImplementationOnce(capture).mockImplementationOnce(capture);

    const { unmount } = await renderApp();
    expect(await screen.findByText('Done: “Pay the electricity bill”')).toBeOnTheScreen();
    await act(async () => late.forEach((listener) => listener(press('done'))));

    expect(await status()).toBe('done');
    expect(fakeNotifications.dismissed).toEqual(['reminder-1']);
    expect(clearLastOpenedNotification).toHaveBeenCalled();
    expect(fakeNotifications.lastOpened).toBeNull();

    await unmount();
    clearNotificationOutcome();
    await renderApp();
    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
  });

  it.each([
    ['closed', () => repositories.deadlines.update('pay', { status: 'done' })],
    ['deleted with its document', () => repositories.documents.remove('bill')],
  ])('changes nothing for a deadline %s, and the app just opens', async (_case, change) => {
    await change();
    await renderApp();

    await act(async () => fakeNotifications.tap(press('snooze')));
    await act(async () => fakeNotifications.tap(press('done', 'reminder-2')));

    await waitFor(() => expect(fakeNotifications.dismissed).toHaveLength(2));
    expect(screen.getByText('Documents')).toBeOnTheScreen();
    expect(screen).toHavePathname('/');
    expect(
      (await repositories.deadlines.list({})).map((deadline) => deadline.snoozedUntil)
    ).toEqual((await repositories.deadlines.list({})).map(() => null));
  });

  it('leaves the tap on the notification itself to the opener (REM-6)', async () => {
    await renderApp();

    await act(async () => fakeNotifications.tap(press('open')));

    expect(await screen.findByText('Document bill')).toBeOnTheScreen();
    expect(await status()).toBe('open');
    expect(fakeNotifications.dismissed).toEqual([]);
  });

  it('drops the offer once the person leaves the tab', async () => {
    await renderApp();
    await act(async () => fakeNotifications.tap(press('done')));
    expect(await screen.findByText('Done: “Pay the electricity bill”')).toBeOnTheScreen();

    await act(() => router.navigate('/'));
    await act(() => router.navigate('/deadlines'));

    expect(await screen.findByText('No open deadlines')).toBeOnTheScreen();
    expect(screen.queryByText('Done: “Pay the electricity bill”')).not.toBeOnTheScreen();
  });
});
