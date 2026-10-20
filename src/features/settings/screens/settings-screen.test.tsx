/** @jest-environment ./src/test/time-zone-environment.js */
import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import { syncReminders } from '@/features/reminders/sync-reminders';
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import { DEFAULT_SETTINGS } from '@/lib/db/types';
import { savePageFile } from '@/lib/files/page-files';
import { i18n } from '@/lib/i18n/i18n';
import { LanguageSync } from '@/providers/language-sync';
import { fakeFileSystem } from '@/test/fake-file-system';
import { dismissShownNotifications, fakeNotifications } from '@/test/fake-notifications';
import { renderWithProviders } from '@/test/render';
import { installTestRepositories } from '@/test/sqlite';
import { setTimeZone } from '@/test/time-zone';

import { SettingsScreen } from './settings-screen';

jest.mock('expo-file-system', () => jest.requireActual('@/test/fake-file-system'));
jest.mock('@/lib/api/client-headers', () => ({ getClientHeaders: async () => ({}) }));
jest.mock('@/components/ui/time-picker', () =>
  jest.requireActual('@/components/ui/time-picker.web')
);

let repositories: Repositories;
let fetchSpy: jest.SpyInstance<Promise<Response>, Parameters<typeof fetch>>;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

const limits = (remaining = 7) =>
  json(200, { dailyLimit: 10, remaining, resetsAt: '2026-10-21T00:00:00.000Z' });

beforeEach(async () => {
  // Berlin: 09:00 is 08:00Z in November, 18:30 is 17:30Z.
  setTimeZone('Europe/Berlin');
  fakeFileSystem.reset();
  ({ repositories } = await installTestRepositories());
  fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => limits());
});

afterEach(() => {
  setRepositories(null);
  jest.restoreAllMocks();
});

async function renderSettings() {
  await renderWithProviders(
    <>
      <LanguageSync />
      <SettingsScreen />
    </>
  );
  // The remaining analyses come from the server: wait for them, so they don't arrive after the test.
  await screen.findByText(
    /^(Analyses left today|Осталось анализов сегодня|Couldn't check|Не удалось узнать)/
  );
}

/** A document with its page file and a deadline far ahead, so reminders are planned whenever this runs. */
const SCAN = 'file:///data/cache/scan.jpg';

async function seedDocument() {
  fakeFileSystem.addFile(SCAN);
  const relativePath = await savePageFile('doc-1', SCAN, 'p1.jpg');
  await repositories.documents.create(
    {
      id: 'doc-1',
      title: 'Electricity bill',
      source: 'scan',
      mimeType: 'image/jpeg',
      fileSize: 10,
    },
    [{ id: 'p1', relativePath, width: 1448, height: 2048 }]
  );
  await repositories.deadlines.insertMany([
    {
      id: 'pay',
      documentId: 'doc-1',
      kind: 'payment',
      description: 'Pay 120 EUR to Stadtwerke',
      dueDate: '2099-11-20',
      dateSource: 'explicit',
      confidence: 'high',
    },
  ]);
}

function pendingFireTimes() {
  return fakeNotifications.pending().map((notification) => notification.fireAt);
}

describe('SettingsScreen language (SET-1)', () => {
  it('switches the interface to Russian and stores the choice', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(await screen.findByRole('radio', { name: 'Русский' }));

    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked();
    expect((await repositories.settings.get()).locale).toBe('ru');
    expect(i18n.language).toBe('ru');
  });

  it('starts from the stored choice', async () => {
    await repositories.settings.update({ locale: 'ru' });

    await renderSettings();

    expect(await screen.findByRole('heading', { name: 'Настройки' })).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Русский' })).toBeChecked();
  });

  it('follows the device language with "System default"', async () => {
    const user = userEvent.setup();
    await repositories.settings.update({ locale: 'ru' });
    await renderSettings();

    await user.press(await screen.findByRole('radio', { name: 'Как в системе' }));

    // The test device language is English.
    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeOnTheScreen();
    expect((await repositories.settings.get()).locale).toBe('system');
  });

  it('explains documents in another language than the interface, or the same again (D-5)', async () => {
    const user = userEvent.setup();
    await renderSettings();
    expect(
      screen.getByRole('radio', { name: 'Explanation language: Same as the app' })
    ).toBeChecked();

    await user.press(screen.getByRole('radio', { name: 'Explanation language: Русский' }));

    await waitFor(async () =>
      expect((await repositories.settings.get()).explanationLocale).toBe('ru')
    );
    expect(screen.getByRole('radio', { name: 'Explanation language: Русский' })).toBeChecked();
    // The interface stays in English.
    expect(screen.getByRole('radio', { name: 'Русский' })).not.toBeChecked();
    expect(i18n.language).toBe('en');

    await user.press(screen.getByRole('radio', { name: 'Explanation language: Same as the app' }));

    await waitFor(async () =>
      expect((await repositories.settings.get()).explanationLocale).toBeNull()
    );
  });

  it('says when a choice could not be saved and shows the stored one', async () => {
    const user = userEvent.setup();
    jest.spyOn(repositories.settings, 'update').mockRejectedValueOnce(new Error('disk full'));
    await renderSettings();

    await user.press(await screen.findByRole('radio', { name: 'English' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't save the setting. Try again."
    );
    expect(screen.getByRole('radio', { name: 'System default' })).toBeChecked();
  });
});

describe('SettingsScreen reminders (SET-2, SET-5)', () => {
  beforeEach(async () => {
    fakeNotifications.permission = 'granted';
    await seedDocument();
    await syncReminders();
  });

  it('shows the defaults: 7 days, 1 day and on the day at 09:00, without details', async () => {
    await renderSettings();

    expect(await screen.findByRole('checkbox', { name: '7 days before' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '1 day before' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'On the day' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: '14 days before' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: '3 days before' })).not.toBeChecked();
    expect(screen.getByText('09:00 AM')).toBeOnTheScreen();
    expect(screen.getByRole('switch', { name: 'Details in notifications' })).not.toBeChecked();
    expect(pendingFireTimes()).toEqual([
      '2099-11-13T08:00:00.000Z',
      '2099-11-19T08:00:00.000Z',
      '2099-11-20T08:00:00.000Z',
    ]);
  });

  it('adds and removes a day and reschedules the reminders', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(await screen.findByRole('checkbox', { name: '14 days before' }));
    expect(await screen.findByRole('checkbox', { name: '14 days before' })).toBeChecked();
    await waitFor(() => expect(pendingFireTimes()).toHaveLength(4));
    await user.press(screen.getByRole('checkbox', { name: '1 day before' }));

    await waitFor(async () =>
      expect((await repositories.settings.get()).reminderOffsetsDays).toEqual([14, 7, 0])
    );
    await waitFor(() =>
      expect(pendingFireTimes()).toEqual([
        '2099-11-06T08:00:00.000Z',
        '2099-11-13T08:00:00.000Z',
        '2099-11-20T08:00:00.000Z',
      ])
    );
  });

  it('keeps at least one day, which «Remind me» on a deadline brings back', async () => {
    const user = userEvent.setup();
    await repositories.settings.update({ reminderOffsetsDays: [7, 0] });
    await renderSettings();

    await user.press(await screen.findByRole('checkbox', { name: '7 days before' }));

    expect(await screen.findByText('At least one reminder stays on.')).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: 'On the day' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'On the day' })).toBeDisabled();
    expect((await repositories.settings.get()).reminderOffsetsDays).toEqual([0]);
  });

  it('changes the time and reschedules the reminders', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(
      await screen.findByRole('button', { name: 'Change reminder time, now 09:00 AM' })
    );
    const field = screen.getByLabelText('Reminder time');
    await user.clear(field);
    await user.type(field, '18:30');
    await user.press(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('06:30 PM')).toBeOnTheScreen();
    expect((await repositories.settings.get()).reminderTime).toBe('18:30');
    await waitFor(() =>
      expect(pendingFireTimes()).toEqual([
        '2099-11-13T17:30:00.000Z',
        '2099-11-19T17:30:00.000Z',
        '2099-11-20T17:30:00.000Z',
      ])
    );
  });

  it('leaves the time as it was on «Cancel»', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(
      await screen.findByRole('button', { name: 'Change reminder time, now 09:00 AM' })
    );
    await user.press(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByLabelText('Reminder time')).not.toBeOnTheScreen();
    expect((await repositories.settings.get()).reminderTime).toBe('09:00');
  });

  it('puts what a deadline is about into the notification text with «Details» (REM-12)', async () => {
    await renderSettings();
    expect(fakeNotifications.pending()[0].body).toBe('A document deadline is in 7 days');

    await fireEvent(
      await screen.findByRole('switch', { name: 'Details in notifications' }),
      'valueChange',
      true
    );

    expect(await screen.findByRole('switch', { name: 'Details in notifications' })).toBeChecked();
    expect((await repositories.settings.get()).notificationDetails).toBe(true);
    await waitFor(() =>
      expect(fakeNotifications.pending()[0].body).toBe('In 7 days: Pay 120 EUR to Stadtwerke')
    );
  });
});

describe('SettingsScreen remaining analyses (SET-4)', () => {
  it('shows what is left today and when the limit resets, in local time', async () => {
    await renderSettings();

    expect(await screen.findByText('Analyses left today: 7 of 10')).toBeOnTheScreen();
    // Midnight UTC is 02:00 in Berlin in October (summer time).
    expect(screen.getByText(/^The limit resets Oct 21, 02:00 AM$/)).toBeOnTheScreen();
    expect(String(fetchSpy.mock.calls[0][0])).toMatch(/\/api\/v1\/limits$/);
  });

  it('says when it could not ask the server and tries again', async () => {
    const user = userEvent.setup();
    fetchSpy.mockImplementationOnce(async () => {
      throw new TypeError('Network request failed');
    });
    await renderSettings();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Couldn't check how many analyses are left."
    );
    fetchSpy.mockImplementation(async () => limits(3));
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('Analyses left today: 3 of 10')).toBeOnTheScreen();
  });
});

describe('SettingsScreen «Delete all data» (SET-3, STO-7)', () => {
  beforeEach(async () => {
    fakeNotifications.permission = 'granted';
    await seedDocument();
    await syncReminders();
    await repositories.settings.update({ locale: 'ru', reminderTime: '08:00' });
  });

  it('asks first and deletes nothing on «Cancel»', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(await screen.findByRole('button', { name: 'Удалить все данные' }));
    expect(screen.getByRole('heading', { name: 'Удалить все данные?' })).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Отмена' }));

    expect(screen.getByRole('button', { name: 'Удалить все данные' })).toBeOnTheScreen();
    expect(await repositories.documents.list()).toHaveLength(1);
    expect(fakeNotifications.pending()).toHaveLength(3);
  });

  it('deletes documents, page files, reminders and settings', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.press(await screen.findByRole('button', { name: 'Удалить все данные' }));
    await user.press(screen.getByRole('button', { name: 'Удалить всё' }));

    // The settings are gone too: the interface follows the device again.
    expect(await screen.findByText('All data deleted.')).toBeOnTheScreen();
    expect(i18n.language).toBe('en');
    expect(await repositories.documents.list()).toEqual([]);
    expect(await repositories.deadlines.list()).toEqual([]);
    expect(await repositories.settings.get()).toEqual(DEFAULT_SETTINGS);
    // Only the scanner's cache is left, outside the documents folder.
    expect(fakeFileSystem.files()).toEqual([SCAN]);
    expect(fakeNotifications.pending()).toEqual([]);
    expect(await repositories.scheduledNotifications.list()).toEqual([]);
    expect(dismissShownNotifications).toHaveBeenCalled();
  });

  it('says when it failed, and deletes everything on a second try', async () => {
    const user = userEvent.setup();
    jest.spyOn(repositories, 'wipeAll').mockRejectedValueOnce(new Error('disk I/O error'));
    await renderSettings();

    await user.press(await screen.findByRole('button', { name: 'Удалить все данные' }));
    await user.press(screen.getByRole('button', { name: 'Удалить всё' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Не удалось удалить все данные. Попробуйте ещё раз.'
    );
    await user.press(screen.getByRole('button', { name: 'Удалить все данные' }));
    expect(screen.queryByRole('alert')).not.toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Удалить всё' }));

    expect(await screen.findByText('All data deleted.')).toBeOnTheScreen();
    expect(await repositories.documents.list()).toEqual([]);
  });
});

describe('SettingsScreen states', () => {
  it('shows an error with «Try again» when the settings cannot be read', async () => {
    const user = userEvent.setup();
    jest.spyOn(repositories.settings, 'get').mockRejectedValueOnce(new Error('disk I/O error'));
    await renderWithProviders(<SettingsScreen />);

    expect(await screen.findByText('Something went wrong')).toBeOnTheScreen();
    await user.press(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { name: 'Settings' })).toBeOnTheScreen();
  });

  it('shows the disclaimer and the version (SET-4)', async () => {
    await renderSettings();

    expect(
      await screen.findByText(
        'This is not legal advice. Check important dates and amounts against the original document.'
      )
    ).toBeOnTheScreen();
    expect(screen.getByText('Version')).toBeOnTheScreen();
  });
});
