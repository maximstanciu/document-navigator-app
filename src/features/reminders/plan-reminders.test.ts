/** @jest-environment ./src/test/time-zone-environment.js */
import { createRepositories } from '@/lib/db/repositories';
import { DEFAULT_SETTINGS, type ScheduledNotificationRecord } from '@/lib/db/types';
import { i18n } from '@/lib/i18n/i18n';
import { createFakeClock, createTestDatabase } from '@/test/sqlite';
import { setTimeZone } from '@/test/time-zone';

import {
  diffReminders,
  planReminders,
  REMINDER_LIMIT,
  reminderMessage,
  toScheduledRecord,
  type PlannedReminder,
  type ReminderDeadline,
  type ReminderSettings,
} from './plan-reminders';

// Berlin by default: it has DST, and its clocks go back on 2026-10-25 and forward on 2027-03-28.
// Expected fire times are written as UTC instants: 09:00 is 07:00Z in summer, 08:00Z in winter.
beforeEach(() => {
  setTimeZone('Europe/Berlin');
});

const SETTINGS: ReminderSettings = { ...DEFAULT_SETTINGS, language: 'en' };

function deadline(overrides: Partial<ReminderDeadline> = {}): ReminderDeadline {
  return {
    id: 'pay',
    documentId: 'doc-1',
    description: 'Pay the electricity bill',
    dueDate: '2026-11-20',
    status: 'open',
    reminderOffsetsDays: null,
    updatedAt: '2026-10-17T09:00:00.000Z',
    deletedAt: null,
    ...overrides,
  };
}

/** The state right after `syncReminders()` scheduled `reminders`. */
function synced(reminders: readonly PlannedReminder[]): ScheduledNotificationRecord[] {
  return reminders.map(toScheduledRecord);
}

const OCT_18 = new Date('2026-10-18T10:00:00+02:00');

describe('planReminders', () => {
  it('reminds 7 days, 1 day and on the day at 09:00 local time by default (REM-2)', () => {
    expect(planReminders([deadline()], SETTINGS, OCT_18)).toEqual([
      {
        id: expect.any(String),
        deadlineId: 'pay',
        documentId: 'doc-1',
        fireAt: '2026-11-13T08:00:00.000Z',
        daysBefore: 7,
        text: {
          variant: 'neutral',
          key: 'reminders.notification.neutral.inDays',
          params: { count: 7 },
        },
      },
      {
        id: expect.any(String),
        deadlineId: 'pay',
        documentId: 'doc-1',
        fireAt: '2026-11-19T08:00:00.000Z',
        daysBefore: 1,
        text: {
          variant: 'neutral',
          key: 'reminders.notification.neutral.tomorrow',
          params: { count: 1 },
        },
      },
      {
        id: expect.any(String),
        deadlineId: 'pay',
        documentId: 'doc-1',
        fireAt: '2026-11-20T08:00:00.000Z',
        daysBefore: 0,
        text: {
          variant: 'neutral',
          key: 'reminders.notification.neutral.today',
          params: { count: 0 },
        },
      },
    ]);
  });

  it('uses the deadline’s own offsets, or none, over the defaults (REM-3)', () => {
    const plan = planReminders(
      [
        deadline({ id: 'own', reminderOffsetsDays: [3] }),
        deadline({ id: 'off', reminderOffsetsDays: [] }),
      ],
      SETTINGS,
      OCT_18
    );

    expect(plan.map((reminder) => [reminder.deadlineId, reminder.fireAt])).toEqual([
      ['own', '2026-11-17T08:00:00.000Z'],
    ]);
  });

  it('takes the default offsets and time from the settings (REM-3, SET-2)', () => {
    const settings = { ...SETTINGS, reminderOffsetsDays: [2], reminderTime: '18:30' };

    expect(planReminders([deadline()], settings, OCT_18).map((r) => r.fireAt)).toEqual([
      '2026-11-18T17:30:00.000Z',
    ]);
  });

  it('ignores repeated, negative and fractional offsets', () => {
    const plan = planReminders(
      [deadline({ reminderOffsetsDays: [1, 1, -2, 0.5] })],
      SETTINGS,
      OCT_18
    );

    expect(plan.map((reminder) => reminder.daysBefore)).toEqual([1]);
  });

  it('skips reminders in the past and deadlines that have passed (REM-2)', () => {
    const plan = planReminders(
      [deadline(), deadline({ id: 'passed', dueDate: '2026-11-10' })],
      SETTINGS,
      new Date('2026-11-18T12:00:00+01:00')
    );

    expect(plan.map((reminder) => [reminder.deadlineId, reminder.daysBefore])).toEqual([
      ['pay', 1],
      ['pay', 0],
    ]);
  });

  describe('a deadline today', () => {
    it('gets the same-day reminder while 09:00 is still ahead', () => {
      const plan = planReminders([deadline()], SETTINGS, new Date('2026-11-20T08:59:00+01:00'));

      expect(plan.map((reminder) => [reminder.fireAt, reminder.text.key])).toEqual([
        ['2026-11-20T08:00:00.000Z', 'reminders.notification.neutral.today'],
      ]);
    });

    it.each(['2026-11-20T09:00:00+01:00', '2026-11-20T15:00:00+01:00'])(
      'gets nothing at %s, when 09:00 has come',
      (now) => {
        expect(planReminders([deadline()], SETTINGS, new Date(now))).toEqual([]);
      }
    );
  });

  it('keeps 09:00 local time across the autumn DST change', () => {
    const plan = planReminders([deadline({ dueDate: '2026-10-30' })], SETTINGS, OCT_18);

    expect(plan.map((reminder) => reminder.fireAt)).toEqual([
      '2026-10-23T07:00:00.000Z',
      '2026-10-29T08:00:00.000Z',
      '2026-10-30T08:00:00.000Z',
    ]);
  });

  it('keeps 09:00 local time across the spring DST change, on the day of the change too', () => {
    const plan = planReminders(
      [deadline({ dueDate: '2027-03-29' })],
      SETTINGS,
      new Date('2027-03-01T10:00:00+01:00')
    );

    expect(plan.map((reminder) => reminder.fireAt)).toEqual([
      '2027-03-22T08:00:00.000Z',
      '2027-03-28T07:00:00.000Z',
      '2027-03-29T07:00:00.000Z',
    ]);
  });

  it('counts days across a month boundary', () => {
    const plan = planReminders([deadline({ dueDate: '2026-12-03' })], SETTINGS, OCT_18);

    expect(plan.map((reminder) => reminder.fireAt)).toEqual([
      '2026-11-26T08:00:00.000Z',
      '2026-12-02T08:00:00.000Z',
      '2026-12-03T08:00:00.000Z',
    ]);
  });

  it.each([
    ['done', deadline({ status: 'done' })],
    ['dismissed', deadline({ status: 'dismissed' })],
    ['deleted', deadline({ deletedAt: '2026-10-17T10:00:00.000Z' })],
  ])('plans nothing for a %s deadline (REM-9)', (_, closed) => {
    expect(planReminders([closed], SETTINGS, OCT_18)).toEqual([]);
  });

  it('skips a deadline whose date is not a calendar date', () => {
    expect(planReminders([deadline({ dueDate: '2026-02-30' })], SETTINGS, OCT_18)).toEqual([]);
  });

  it('orders by fire time, then deadline id, whatever the input order', () => {
    const deadlines = [
      deadline({ id: 'b', reminderOffsetsDays: [0, 1] }),
      deadline({ id: 'a', reminderOffsetsDays: [0, 1] }),
    ];

    const plan = planReminders(deadlines, SETTINGS, OCT_18);

    expect(plan.map((reminder) => [reminder.deadlineId, reminder.daysBefore])).toEqual([
      ['a', 1],
      ['b', 1],
      ['a', 0],
      ['b', 0],
    ]);
    expect(planReminders([...deadlines].reverse(), SETTINGS, OCT_18)).toEqual(plan);
  });

  describe('the limit of 60 (REM-8)', () => {
    // 70 deadlines due on consecutive days from 2026-11-01, one reminder each on the day.
    const deadlines = Array.from({ length: 70 }, (_, index) =>
      deadline({
        id: `d-${String(index).padStart(2, '0')}`,
        dueDate: new Date(Date.UTC(2026, 10, 1 + index)).toISOString().slice(0, 10),
        reminderOffsetsDays: [0],
      })
    );
    const ids = (from: number, to: number) =>
      Array.from({ length: to - from }, (_, index) => `d-${String(from + index).padStart(2, '0')}`);

    it('plans only the nearest 60, the same for any input order', () => {
      const plan = planReminders(deadlines, SETTINGS, OCT_18);

      expect(REMINDER_LIMIT).toBe(60);
      expect(plan.map((reminder) => reminder.deadlineId)).toEqual(ids(0, 60));
      expect(planReminders([...deadlines].reverse(), SETTINGS, OCT_18)).toEqual(plan);
    });

    it('lets a later sync schedule the rest as the nearest ones fire', () => {
      const scheduled = synced(planReminders(deadlines, SETTINGS, OCT_18));

      const later = planReminders(deadlines, SETTINGS, new Date('2026-11-05T12:00:00+01:00'));
      const diff = diffReminders(later, scheduled);

      expect(later.map((reminder) => reminder.deadlineId)).toEqual(ids(5, 65));
      expect(diff.schedule.map((reminder) => reminder.deadlineId)).toEqual(ids(60, 65));
      expect(diff.cancel).toEqual(scheduled.slice(0, 5).map((record) => record.notificationId));
    });
  });

  describe('notification text (REM-12, SET-5)', () => {
    it('is neutral by default and carries nothing from the deadline', () => {
      const plan = planReminders([deadline()], SETTINGS, OCT_18);

      expect(JSON.stringify(plan)).not.toContain('electricity');
      expect(plan.map((reminder) => reminderMessage(reminder.text, i18n.t))).toEqual([
        'A document deadline is in 7 days',
        'A document deadline is tomorrow',
        'A document deadline is today',
      ]);
    });

    it('shows the deadline’s description with «Details in notifications» on', () => {
      const plan = planReminders([deadline()], { ...SETTINGS, notificationDetails: true }, OCT_18);

      expect(plan.map((reminder) => reminderMessage(reminder.text, i18n.t))).toEqual([
        'In 7 days: Pay the electricity bill',
        'Tomorrow: Pay the electricity bill',
        'Today: Pay the electricity bill',
      ]);
    });

    it('has the Russian plural forms', () => {
      const ru = i18n.getFixedT('ru');
      const plan = planReminders(
        [deadline({ dueDate: '2026-12-31', reminderOffsetsDays: [21, 7, 3, 1, 0] })],
        SETTINGS,
        OCT_18
      );

      expect(plan.map((reminder) => reminderMessage(reminder.text, ru))).toEqual([
        'Срок по документу через 21 день',
        'Срок по документу через 7 дней',
        'Срок по документу через 3 дня',
        'Срок по документу завтра',
        'Срок по документу сегодня',
      ]);
    });
  });
});

describe('diffReminders (REM-7)', () => {
  it('schedules everything on the first sync', () => {
    const plan = planReminders([deadline()], SETTINGS, OCT_18);

    expect(diffReminders(plan, [])).toEqual({ schedule: plan, cancel: [] });
  });

  it('changes nothing when run again on an already synced state', () => {
    const deadlines = [deadline(), deadline({ id: 'fee', dueDate: '2026-12-01' })];
    const scheduled = synced(planReminders(deadlines, SETTINGS, OCT_18));

    const again = planReminders(deadlines, SETTINGS, new Date('2026-10-19T08:00:00+02:00'));

    expect(scheduled).toHaveLength(6);
    expect(diffReminders(again, scheduled)).toEqual({ schedule: [], cancel: [] });
  });

  it('cancels the reminders of a deadline that is done, dismissed or deleted (REM-9)', () => {
    const scheduled = synced(
      planReminders([deadline(), deadline({ id: 'fee' })], SETTINGS, OCT_18)
    );

    const plan = planReminders(
      [deadline({ status: 'done' }), deadline({ id: 'fee' })],
      SETTINGS,
      OCT_18
    );

    expect(diffReminders(plan, scheduled)).toEqual({
      schedule: [],
      cancel: scheduled
        .filter((record) => record.deadlineId === 'pay')
        .map((record) => record.notificationId),
    });
  });

  it('drops reminders that already fired', () => {
    const scheduled = synced(planReminders([deadline()], SETTINGS, OCT_18));

    const plan = planReminders([deadline()], SETTINGS, new Date('2026-11-19T12:00:00+01:00'));

    expect(diffReminders(plan, scheduled)).toEqual({
      schedule: [],
      cancel: [scheduled[0].notificationId, scheduled[1].notificationId],
    });
  });

  it('moves reminders when the due date changes, the text included', () => {
    const scheduled = synced(planReminders([deadline()], SETTINGS, OCT_18));

    // The 09:00 reminder on 2026-11-20 stays at the same instant but now says «tomorrow».
    const plan = planReminders([deadline({ dueDate: '2026-11-21' })], SETTINGS, OCT_18);
    const diff = diffReminders(plan, scheduled);

    expect(diff.cancel).toEqual(scheduled.map((record) => record.notificationId));
    expect(diff.schedule.map((reminder) => [reminder.fireAt, reminder.text.key])).toEqual([
      ['2026-11-14T08:00:00.000Z', 'reminders.notification.neutral.inDays'],
      ['2026-11-20T08:00:00.000Z', 'reminders.notification.neutral.tomorrow'],
      ['2026-11-21T08:00:00.000Z', 'reminders.notification.neutral.today'],
    ]);
  });

  it('reschedules at 09:00 in the new time zone after the device moves, then settles', () => {
    const scheduled = synced(planReminders([deadline()], SETTINGS, OCT_18));

    setTimeZone('America/New_York');
    const plan = planReminders([deadline()], SETTINGS, OCT_18);
    const diff = diffReminders(plan, scheduled);

    expect(diff.cancel).toEqual(scheduled.map((record) => record.notificationId));
    expect(diff.schedule.map((reminder) => reminder.fireAt)).toEqual([
      '2026-11-13T14:00:00.000Z',
      '2026-11-19T14:00:00.000Z',
      '2026-11-20T14:00:00.000Z',
    ]);
    expect(diffReminders(planReminders([deadline()], SETTINGS, OCT_18), synced(plan))).toEqual({
      schedule: [],
      cancel: [],
    });
  });

  it('keeps reminders when the new time zone has the same local time', () => {
    const scheduled = synced(planReminders([deadline()], SETTINGS, OCT_18));

    setTimeZone('Europe/Paris');

    expect(diffReminders(planReminders([deadline()], SETTINGS, OCT_18), scheduled)).toEqual({
      schedule: [],
      cancel: [],
    });
  });

  it('replaces the text when the interface language changes (SET-1)', () => {
    const scheduled = synced(planReminders([deadline()], SETTINGS, OCT_18));

    const diff = diffReminders(
      planReminders([deadline()], { ...SETTINGS, language: 'ru' }, OCT_18),
      scheduled
    );

    expect(diff.schedule).toHaveLength(3);
    expect(diff.cancel).toEqual(scheduled.map((record) => record.notificationId));
  });

  it('replaces the text when «Details in notifications» is switched or the deadline changes', () => {
    const details = { ...SETTINGS, notificationDetails: true };
    const neutral = synced(planReminders([deadline()], SETTINGS, OCT_18));
    const detailed = synced(planReminders([deadline()], details, OCT_18));

    const switched = diffReminders(planReminders([deadline()], details, OCT_18), neutral);
    const edited = diffReminders(
      planReminders(
        [deadline({ description: 'Pay the gas bill', updatedAt: '2026-10-18T09:00:00.000Z' })],
        details,
        OCT_18
      ),
      detailed
    );

    expect(switched.schedule).toHaveLength(3);
    expect(switched.cancel).toHaveLength(3);
    expect(edited.schedule.map((reminder) => reminderMessage(reminder.text, i18n.t))).toEqual([
      'In 7 days: Pay the gas bill',
      'Tomorrow: Pay the gas bill',
      'Today: Pay the gas bill',
    ]);
    expect(edited.cancel).toEqual(detailed.map((record) => record.notificationId));
  });
});

describe('a deadline with several actions (REM-9)', () => {
  it('has one set of reminders until every action is done, and gets it back when one is undone', async () => {
    const clock = createFakeClock('2026-10-18T08:00:00.000Z');
    const repos = createRepositories(await createTestDatabase(), clock.now);
    await repos.documents.create({
      id: 'doc-1',
      title: 'Bill',
      source: 'file',
      mimeType: 'application/pdf',
      fileSize: 10,
    });
    await repos.deadlines.insertMany([
      {
        id: 'pay',
        documentId: 'doc-1',
        kind: 'payment',
        description: 'Pay the electricity bill',
        dueDate: '2026-11-20',
        dateSource: 'explicit',
        confidence: 'high',
      },
    ]);
    await repos.actions.insertMany(
      ['check', 'pay-online', 'keep-receipt'].map((id) => ({
        id,
        documentId: 'doc-1',
        deadlineId: 'pay',
        description: id,
        priority: 'high' as const,
      }))
    );
    const plan = async () => planReminders(await repos.deadlines.list(), SETTINGS, clock.now());

    const initial = await plan();
    const scheduled = synced(initial);
    await repos.actions.setDone('check', true);
    await repos.actions.setDone('pay-online', true);
    const partlyDone = await plan();
    await repos.actions.setDone('keep-receipt', true);
    const allDone = await plan();
    await repos.actions.setDone('pay-online', false);
    const reopened = await plan();

    expect(initial.map((reminder) => [reminder.deadlineId, reminder.daysBefore])).toEqual([
      ['pay', 7],
      ['pay', 1],
      ['pay', 0],
    ]);
    expect(diffReminders(partlyDone, scheduled)).toEqual({ schedule: [], cancel: [] });
    expect(diffReminders(allDone, scheduled)).toEqual({
      schedule: [],
      cancel: scheduled.map((record) => record.notificationId),
    });
    expect(reopened).toEqual(initial);
  });
});
