import { act, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { i18n } from '@/lib/i18n/i18n';
import {
  fakeNotifications,
  requestNotificationPermission,
  setUpNotifications,
} from '@/test/fake-notifications';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';

import { ReminderSync } from './reminder-sync';

let repositories: Repositories;
let onAppStateChange: ((status: AppStateStatus) => void) | undefined;

beforeEach(async () => {
  ({ repositories } = await installTestRepositories());
  await repositories.documents.create({
    id: 'doc-1',
    title: 'Electricity bill',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 10,
  });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, listener) => {
    onAppStateChange = listener;
    return { remove: () => (onAppStateChange = undefined) };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  setRepositories(null);
});

/** Far enough ahead that all three default reminders are always in the future. */
async function addDeadline(id: string) {
  await repositories.deadlines.insertMany([
    {
      id,
      documentId: 'doc-1',
      kind: 'payment',
      description: 'Pay the electricity bill',
      dueDate: '2099-01-15',
      dateSource: 'explicit',
      confidence: 'high',
    },
  ]);
}

function bodies() {
  return [...new Set(fakeNotifications.pending().map((notification) => notification.body))];
}

describe('ReminderSync', () => {
  it('sets up the channel and syncs at start without asking for the permission (REM-4, REM-5)', async () => {
    fakeNotifications.permission = 'granted';
    await addDeadline('pay');

    await renderWithProviders(<ReminderSync />);

    await waitFor(() => expect(fakeNotifications.scheduled.size).toBe(3));
    expect(setUpNotifications).toHaveBeenCalledWith({
      name: 'Deadlines',
      description: 'Reminders about document deadlines',
    });
    expect(requestNotificationPermission).not.toHaveBeenCalled();
  });

  it('never asks at start when the permission is not decided yet (REM-5)', async () => {
    fakeNotifications.permission = 'undetermined';
    await addDeadline('pay');

    await renderWithProviders(<ReminderSync />);

    await waitFor(() => expect(setUpNotifications).toHaveBeenCalledTimes(1));
    expect(requestNotificationPermission).not.toHaveBeenCalled();
    expect(fakeNotifications.scheduled.size).toBe(0);
  });

  it('renames the channel and rewrites the reminders when the language changes', async () => {
    fakeNotifications.permission = 'granted';
    await addDeadline('pay');
    await renderWithProviders(<ReminderSync />);
    await waitFor(() => expect(fakeNotifications.scheduled.size).toBe(3));

    await act(() => i18n.changeLanguage('ru'));

    await waitFor(() =>
      expect(setUpNotifications).toHaveBeenLastCalledWith({
        name: 'Сроки',
        description: 'Напоминания о сроках по документам',
      })
    );
    await waitFor(() =>
      expect(bodies()).toEqual([
        'Срок по документу через 7 дней',
        'Срок по документу завтра',
        'Срок по документу сегодня',
      ])
    );
    expect(fakeNotifications.scheduled.size).toBe(3);
  });

  it('syncs again when the app returns to the foreground (REM-7)', async () => {
    fakeNotifications.permission = 'denied';
    await addDeadline('pay');
    await renderWithProviders(<ReminderSync />);
    await waitFor(() => expect(setUpNotifications).toHaveBeenCalledTimes(1));

    // The person allows notifications in system settings and comes back.
    onAppStateChange?.('background');
    fakeNotifications.permission = 'granted';
    onAppStateChange?.('active');

    await waitFor(() => expect(fakeNotifications.scheduled.size).toBe(3));
  });
});
