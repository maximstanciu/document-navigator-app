/** @jest-environment ./src/test/time-zone-environment.js */
import { setRepositories, type Repositories } from '@/lib/db/repositories';
import type { NewDeadline } from '@/lib/db/deadlines-repository';
import { i18n } from '@/lib/i18n/i18n';
import {
  cancelNotification,
  fakeNotifications,
  scheduleNotification,
} from '@/test/fake-notifications';
import { installTestRepositories } from '@/test/sqlite';
import { setTimeZone } from '@/test/time-zone';

import { REMINDER_LIMIT } from './plan-reminders';
import { syncReminders, syncRemindersInBackground } from './sync-reminders';

// Berlin, as in plan-reminders.test.ts: 09:00 is 08:00Z in November.
const OCT_18 = new Date('2026-10-18T10:00:00+02:00');

let repositories: Repositories;

beforeEach(async () => {
  setTimeZone('Europe/Berlin');
  ({ repositories } = await installTestRepositories());
  fakeNotifications.permission = 'granted';
  await repositories.documents.create({
    id: 'doc-1',
    title: 'Electricity bill',
    source: 'file',
    mimeType: 'application/pdf',
    fileSize: 10,
  });
});

afterEach(() => {
  setRepositories(null);
});

function deadline(overrides: Partial<NewDeadline> = {}): NewDeadline {
  return {
    id: 'pay',
    documentId: 'doc-1',
    kind: 'payment',
    description: 'Pay 120 EUR to Stadtwerke',
    dueDate: '2026-11-20',
    dateSource: 'explicit',
    confidence: 'high',
    ...overrides,
  };
}

async function recorded() {
  return (await repositories.scheduledNotifications.list()).map((record) => record.notificationId);
}

function pendingIds() {
  return fakeNotifications.pending().map((notification) => notification.id);
}

describe('syncReminders (REM-7)', () => {
  it('schedules 7 days, 1 day and on the day at 09:00 with neutral text (REM-2, REM-12)', async () => {
    await repositories.deadlines.insertMany([deadline()]);

    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 3, cancelled: 0 });

    expect(fakeNotifications.pending()).toEqual([
      {
        id: expect.any(String),
        fireAt: '2026-11-13T08:00:00.000Z',
        body: 'A document deadline is in 7 days',
        data: { documentId: 'doc-1', deadlineId: 'pay' },
      },
      expect.objectContaining({
        fireAt: '2026-11-19T08:00:00.000Z',
        body: 'A document deadline is tomorrow',
      }),
      expect.objectContaining({
        fireAt: '2026-11-20T08:00:00.000Z',
        body: 'A document deadline is today',
      }),
    ]);
    // Nothing from the document reaches the OS: no amount, no sender, no description.
    expect(JSON.stringify(fakeNotifications.pending())).not.toMatch(/120|Stadtwerke|Electricity/);
    expect(await recorded()).toEqual(pendingIds());
  });

  it('changes nothing when called again', async () => {
    await repositories.deadlines.insertMany([
      deadline(),
      deadline({ id: 'fee', dueDate: '2027-01-15' }),
    ]);
    await syncReminders(OCT_18);
    const before = { pending: pendingIds(), recorded: await recorded() };
    scheduleNotification.mockClear();
    cancelNotification.mockClear();

    expect(await syncReminders(new Date('2026-10-19T08:00:00+02:00'))).toEqual({
      scheduled: 0,
      cancelled: 0,
    });

    expect(scheduleNotification).not.toHaveBeenCalled();
    expect(cancelNotification).not.toHaveBeenCalled();
    expect({ pending: pendingIds(), recorded: await recorded() }).toEqual(before);
  });

  it('shows the deadline in the text only with «Details in notifications» (SET-5)', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await repositories.settings.update({ notificationDetails: true });

    await syncReminders(OCT_18);

    expect(fakeNotifications.pending().map((notification) => notification.body)).toEqual([
      'In 7 days: Pay 120 EUR to Stadtwerke',
      'Tomorrow: Pay 120 EUR to Stadtwerke',
      'Today: Pay 120 EUR to Stadtwerke',
    ]);
  });

  it('writes the text in the interface language and replaces it when the language changes', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);

    await i18n.changeLanguage('ru');
    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 3, cancelled: 3 });

    expect(fakeNotifications.pending().map((notification) => notification.body)).toEqual([
      'Срок по документу через 7 дней',
      'Срок по документу завтра',
      'Срок по документу сегодня',
    ]);
  });

  it.each([
    ['done', (repos: Repositories) => repos.deadlines.update('pay', { status: 'done' })],
    [
      'not relevant',
      (repos: Repositories) => repos.deadlines.update('pay', { status: 'dismissed' }),
    ],
    [
      'off for this deadline',
      (repos: Repositories) => repos.deadlines.update('pay', { reminderOffsetsDays: [] }),
    ],
    ['deleted with its document', (repos: Repositories) => repos.documents.remove('doc-1')],
  ])('cancels the reminders of a deadline %s (REM-3, REM-9, STO-6)', async (_case, change) => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);

    await change(repositories);
    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 0, cancelled: 3 });

    expect(fakeNotifications.pending()).toEqual([]);
    expect(await recorded()).toEqual([]);
  });

  it('moves the reminders with a new due date', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);

    await repositories.deadlines.changeDate('pay', '2026-12-01');
    await syncReminders(OCT_18);

    expect(fakeNotifications.pending().map((notification) => notification.fireAt)).toEqual([
      '2026-11-24T08:00:00.000Z',
      '2026-11-30T08:00:00.000Z',
      '2026-12-01T08:00:00.000Z',
    ]);
    expect(await recorded()).toEqual(pendingIds());
  });

  it('forgets reminders that fired', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);

    // The OS drops a notification once it is shown.
    const [fired] = fakeNotifications.pending();
    fakeNotifications.scheduled.delete(fired.id);
    expect(await syncReminders(new Date('2026-11-14T12:00:00+01:00'))).toEqual({
      scheduled: 0,
      cancelled: 0,
    });

    expect(await recorded()).toEqual(pendingIds());
    expect(pendingIds()).toHaveLength(2);
  });

  it('schedules the nearest 60 and the rest as those fire (REM-8)', async () => {
    // 25 deadlines a day apart: 75 reminders.
    await repositories.deadlines.insertMany(
      Array.from({ length: 25 }, (_, index) =>
        deadline({
          id: `d${String(index).padStart(2, '0')}`,
          dueDate: `2026-12-${String(index + 1).padStart(2, '0')}`,
        })
      )
    );

    await syncReminders(OCT_18);
    expect(fakeNotifications.scheduled.size).toBe(REMINDER_LIMIT);
    const last = fakeNotifications.pending().at(-1)!.fireAt;

    // A week of reminders fired.
    for (const notification of fakeNotifications.pending().slice(0, 7)) {
      fakeNotifications.scheduled.delete(notification.id);
    }
    await syncReminders(new Date('2026-12-01T12:00:00+01:00'));

    expect(fakeNotifications.scheduled.size).toBe(REMINDER_LIMIT);
    expect(fakeNotifications.pending().at(-1)!.fireAt > last).toBe(true);
    expect(await recorded()).toHaveLength(REMINDER_LIMIT);
  });

  it('schedules nothing without the permission and catches up once it is granted (REM-5)', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    fakeNotifications.permission = 'undetermined';

    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 0, cancelled: 0 });
    expect(fakeNotifications.scheduled.size).toBe(0);

    fakeNotifications.permission = 'granted';
    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 3, cancelled: 0 });
  });

  it('cancels everything once the permission is taken away in system settings', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);

    fakeNotifications.permission = 'denied';
    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 0, cancelled: 3 });

    expect(await recorded()).toEqual([]);
  });

  it('reschedules a reminder the OS lost and cancels one the table never recorded', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    await syncReminders(OCT_18);
    const [lost] = fakeNotifications.pending();
    fakeNotifications.scheduled.delete(lost.id);
    // Scheduled right before a crash, for a deadline that is gone since.
    fakeNotifications.scheduled.set('gone/2026-11-01T08:00:00.000Z/0d/en/neutral', {
      ...lost,
      id: 'gone/2026-11-01T08:00:00.000Z/0d/en/neutral',
    });

    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 1, cancelled: 1 });

    expect(pendingIds()).toContain(lost.id);
    expect(fakeNotifications.scheduled.size).toBe(3);
    expect(await recorded()).toEqual(pendingIds());
  });

  it('runs overlapping calls one after another', async () => {
    await repositories.deadlines.insertMany([deadline()]);

    const results = await Promise.all([syncReminders(OCT_18), syncReminders(OCT_18)]);

    expect(results).toEqual([
      { scheduled: 3, cancelled: 0 },
      { scheduled: 0, cancelled: 0 },
    ]);
    expect(await recorded()).toHaveLength(3);
  });

  it('leaves a failure to the next sync', async () => {
    await repositories.deadlines.insertMany([deadline()]);
    scheduleNotification.mockRejectedValueOnce(new Error('The OS refused'));

    await expect(syncReminders(OCT_18)).rejects.toThrow('The OS refused');

    expect(await syncReminders(OCT_18)).toEqual({ scheduled: 3, cancelled: 0 });
    expect(await recorded()).toEqual(pendingIds());
  });

  it('runs in the background without throwing', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    setRepositories(null);

    syncRemindersInBackground();
    await expect(syncReminders(OCT_18)).rejects.toThrow('The database is not open yet');

    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });
});
