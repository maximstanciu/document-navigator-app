/** @jest-environment ./src/test/time-zone-environment.js */
import { createRepositories } from '@/lib/db/repositories';
import { DEFAULT_SETTINGS, type ScheduledNotificationRecord } from '@/lib/db/types';
import { i18n } from '@/lib/i18n/i18n';
import { createFakeClock, createTestDatabase } from '@/test/sqlite';
import { setTimeZone } from '@/test/time-zone';

import {
  diffReminders,
  OVERDUE_OFFSET_DAYS,
  planReminders,
  PREPARATION_OFFSET_DAYS,
  REMINDER_CATEGORY,
  REMINDER_LIMIT,
  remindTomorrowAt,
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

/** The real defaults: the reminder the day after a deadline still open (REM-13) is on. */
const DEFAULTS: ReminderSettings = { ...DEFAULT_SETTINGS, language: 'en' };
// Most cases look at the reminders up to the due date; the one after it has its own cases below.
const SETTINGS: ReminderSettings = { ...DEFAULTS, overdueReminder: false };

function deadline(overrides: Partial<ReminderDeadline> = {}): ReminderDeadline {
  return {
    id: 'pay',
    documentId: 'doc-1',
    kind: 'payment',
    description: 'Pay the electricity bill',
    dueDate: '2026-11-20',
    status: 'open',
    reminderOffsetsDays: null,
    snoozedUntil: null,
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
        category: 'deadline_reminder',
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
        category: 'deadline_reminder',
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
        category: 'deadline_reminder',
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

  describe('the reminder the day after (REM-13, SET-7)', () => {
    it('comes once, the day after the due date at the reminder time, and is on by default', () => {
      const plan = planReminders([deadline()], DEFAULTS, OCT_18);

      expect(plan.map((reminder) => [reminder.daysBefore, reminder.fireAt])).toEqual([
        [7, '2026-11-13T08:00:00.000Z'],
        [1, '2026-11-19T08:00:00.000Z'],
        [0, '2026-11-20T08:00:00.000Z'],
        [OVERDUE_OFFSET_DAYS, '2026-11-21T08:00:00.000Z'],
      ]);
      expect(plan.at(-1)!.text).toEqual({
        variant: 'neutral',
        key: 'reminders.notification.neutral.yesterday',
        params: { count: 1 },
      });
    });

    it('says the deadline passed, with the description only with «Details in notifications»', () => {
      const after = (settings: ReminderSettings) =>
        planReminders([deadline()], settings, OCT_18).at(-1)!.text;
      const ru = i18n.getFixedT('ru');

      expect(reminderMessage(after(DEFAULTS), i18n.t)).toBe(
        "A document deadline passed yesterday. If it's done, mark it in the app."
      );
      expect(reminderMessage(after(DEFAULTS), ru)).toBe(
        'Срок по документу прошёл вчера. Если уже сделано, отметьте это в приложении.'
      );
      const details = { ...DEFAULTS, notificationDetails: true };
      expect(reminderMessage(after(details), i18n.t)).toBe(
        'Deadline passed yesterday: Pay the electricity bill'
      );
      expect(reminderMessage(after(details), ru)).toBe(
        'Срок прошёл вчера: Pay the electricity bill'
      );
    });

    it('is still ahead once the due date is over, and gone once it has come', () => {
      const at = (now: string) =>
        planReminders([deadline()], DEFAULTS, new Date(now)).map((reminder) => reminder.fireAt);

      expect(at('2026-11-20T15:00:00+01:00')).toEqual(['2026-11-21T08:00:00.000Z']);
      expect(at('2026-11-21T09:00:00+01:00')).toEqual([]);
    });

    it('comes for a deadline that passed yesterday, not for one that passed before (REM-2)', () => {
      const plan = planReminders(
        [
          deadline({ id: 'yesterday', dueDate: '2026-11-17' }),
          deadline({ id: 'last-week', dueDate: '2026-11-10' }),
        ],
        DEFAULTS,
        new Date('2026-11-18T07:00:00+01:00')
      );

      expect(plan.map((reminder) => [reminder.deadlineId, reminder.fireAt])).toEqual([
        ['yesterday', '2026-11-18T08:00:00.000Z'],
      ]);
    });

    it('goes with the setting off, with the deadline’s reminders off and once it is closed', () => {
      const daysOf = (deadlines: ReminderDeadline[], settings: ReminderSettings) =>
        planReminders(deadlines, settings, OCT_18).map((reminder) => reminder.daysBefore);

      expect(daysOf([deadline()], { ...DEFAULTS, overdueReminder: false })).toEqual([7, 1, 0]);
      expect(daysOf([deadline({ reminderOffsetsDays: [] })], DEFAULTS)).toEqual([]);
      expect(daysOf([deadline({ status: 'done' })], DEFAULTS)).toEqual([]);
      expect(daysOf([deadline({ status: 'dismissed' })], DEFAULTS)).toEqual([]);
    });

    it('follows a deadline’s own offsets too', () => {
      const plan = planReminders([deadline({ reminderOffsetsDays: [3] })], DEFAULTS, OCT_18);

      expect(plan.map((reminder) => reminder.daysBefore)).toEqual([3, OVERDUE_OFFSET_DAYS]);
    });

    it('keeps the reminder time on the day after across a DST change and a month boundary', () => {
      const after = (dueDate: string) =>
        planReminders([deadline({ dueDate })], DEFAULTS, OCT_18).at(-1)!.fireAt;

      // Clocks go back on 2026-10-25: 09:00 is 07:00Z the day before and 08:00Z that day.
      expect(after('2026-10-24')).toBe('2026-10-25T08:00:00.000Z');
      expect(after('2026-11-30')).toBe('2026-12-01T08:00:00.000Z');
      expect(after('2026-12-31')).toBe('2027-01-01T08:00:00.000Z');
    });

    it('counts toward the limit of 60 (REM-8)', () => {
      // 20 deadlines a day apart: 80 reminders with the one after each.
      const deadlines = Array.from({ length: 20 }, (_, index) =>
        deadline({ id: `d${String(index).padStart(2, '0')}`, dueDate: `2026-12-${index + 10}` })
      );

      const plan = planReminders(deadlines, DEFAULTS, OCT_18);

      expect(plan).toHaveLength(REMINDER_LIMIT);
      expect(plan.filter((reminder) => reminder.daysBefore === OVERDUE_OFFSET_DAYS)).not.toEqual(
        []
      );
      expect(plan.map((reminder) => reminder.fireAt)).toEqual(
        [...plan.map((reminder) => reminder.fireAt)].sort()
      );
    });
  });

  describe('14 days ahead for deadlines that take preparation (REM-14)', () => {
    it.each(['response', 'submission', 'cancellation'] as const)(
      'adds 14 days to the default reminders of a %s deadline',
      (kind) => {
        const plan = planReminders([deadline({ kind })], SETTINGS, OCT_18);

        expect(plan.map((reminder) => [reminder.daysBefore, reminder.fireAt])).toEqual([
          [PREPARATION_OFFSET_DAYS, '2026-11-06T08:00:00.000Z'],
          [7, '2026-11-13T08:00:00.000Z'],
          [1, '2026-11-19T08:00:00.000Z'],
          [0, '2026-11-20T08:00:00.000Z'],
        ]);
        expect(reminderMessage(plan[0].text, i18n.t)).toBe('A document deadline is in 14 days');
      }
    );

    it.each(['payment', 'appointment', 'renewal', 'other'] as const)(
      'keeps the default reminders of a %s deadline',
      (kind) => {
        const plan = planReminders([deadline({ kind })], SETTINGS, OCT_18);

        expect(plan.map((reminder) => reminder.daysBefore)).toEqual([7, 1, 0]);
      }
    );

    it('leaves a deadline’s own offsets as they are, and reminders off stay off', () => {
      const plan = planReminders(
        [
          deadline({ id: 'own', kind: 'response', reminderOffsetsDays: [3] }),
          deadline({ id: 'off', kind: 'response', reminderOffsetsDays: [] }),
        ],
        SETTINGS,
        OCT_18
      );

      expect(plan.map((reminder) => [reminder.deadlineId, reminder.daysBefore])).toEqual([
        ['own', 3],
      ]);
    });

    it('does not remind twice when 14 days is among the defaults', () => {
      const settings = { ...SETTINGS, reminderOffsetsDays: [14, 1] };

      const plan = planReminders([deadline({ kind: 'cancellation' })], settings, OCT_18);

      expect(plan.map((reminder) => reminder.daysBefore)).toEqual([14, 1]);
    });

    it('skips 14 days ahead once that day has passed', () => {
      const plan = planReminders(
        [deadline({ kind: 'response' })],
        SETTINGS,
        new Date('2026-11-10T12:00:00+01:00')
      );

      expect(plan.map((reminder) => reminder.daysBefore)).toEqual([7, 1, 0]);
    });
  });

  describe('a reminder put off from a notification (REM-15)', () => {
    const snoozed = (snoozedUntil: string, overrides: Partial<ReminderDeadline> = {}) =>
      deadline({ snoozedUntil, ...overrides });

    it('comes once at that time, its text counting the days to the due date', () => {
      const plan = planReminders([snoozed('2026-11-15T08:00:00.000Z')], SETTINGS, OCT_18);

      expect(plan.map((reminder) => [reminder.daysBefore, reminder.fireAt])).toEqual([
        [7, '2026-11-13T08:00:00.000Z'],
        [5, '2026-11-15T08:00:00.000Z'],
        [1, '2026-11-19T08:00:00.000Z'],
        [0, '2026-11-20T08:00:00.000Z'],
      ]);
      expect(reminderMessage(plan[1].text, i18n.t)).toBe('A document deadline is in 5 days');
    });

    it('says how long ago the deadline passed, with the Russian plural forms', () => {
      const textAt = (snoozedUntil: string, t = i18n.t) =>
        reminderMessage(planReminders([snoozed(snoozedUntil)], SETTINGS, OCT_18).at(-1)!.text, t);
      const ru = i18n.getFixedT('ru');

      expect(textAt('2026-11-22T08:00:00.000Z')).toBe('A document deadline passed 2 days ago');
      expect(textAt('2026-11-22T08:00:00.000Z', ru)).toBe('Срок по документу прошёл 2 дня назад');
      expect(textAt('2026-11-25T08:00:00.000Z', ru)).toBe('Срок по документу прошёл 5 дней назад');
      expect(textAt('2026-12-11T08:00:00.000Z', ru)).toBe('Срок по документу прошёл 21 день назад');
      expect(textAt('2026-11-21T08:00:00.000Z', ru)).toBe(
        'Срок по документу прошёл вчера. Если уже сделано, отметьте это в приложении.'
      );
    });

    it('shows the deadline’s description with «Details in notifications»', () => {
      const plan = planReminders(
        [snoozed('2026-11-23T08:00:00.000Z')],
        { ...SETTINGS, notificationDetails: true },
        OCT_18
      );

      expect(reminderMessage(plan.at(-1)!.text, i18n.t)).toBe(
        'Deadline passed 3 days ago: Pay the electricity bill'
      );
    });

    it('comes once when it falls on another reminder', () => {
      const plan = planReminders([snoozed('2026-11-20T08:00:00.000Z')], DEFAULTS, OCT_18);

      expect(plan.map((reminder) => reminder.fireAt)).toEqual([
        '2026-11-13T08:00:00.000Z',
        '2026-11-19T08:00:00.000Z',
        '2026-11-20T08:00:00.000Z',
        '2026-11-21T08:00:00.000Z',
      ]);
    });

    it('goes once it has come, and with the deadline closed or its reminders off', () => {
      const fireTimes = (deadlines: ReminderDeadline[], now = OCT_18) =>
        planReminders(deadlines, SETTINGS, now).map((reminder) => reminder.fireAt);

      expect(
        fireTimes([snoozed('2026-11-15T08:00:00.000Z')], new Date('2026-11-16T12:00:00Z'))
      ).toEqual(['2026-11-19T08:00:00.000Z', '2026-11-20T08:00:00.000Z']);
      expect(fireTimes([snoozed('2026-11-15T08:00:00.000Z', { status: 'done' })])).toEqual([]);
      expect(fireTimes([snoozed('2026-11-15T08:00:00.000Z', { reminderOffsetsDays: [] })])).toEqual(
        []
      );
      expect(fireTimes([snoozed('not a time')])).toEqual([
        '2026-11-13T08:00:00.000Z',
        '2026-11-19T08:00:00.000Z',
        '2026-11-20T08:00:00.000Z',
      ]);
    });
  });

  it('gives every reminder the category with the buttons, in its id too (REM-15, REM-7)', () => {
    const plan = planReminders([deadline()], DEFAULTS, OCT_18);

    expect(plan.every((reminder) => reminder.category === REMINDER_CATEGORY)).toBe(true);
    expect(plan.every((reminder) => reminder.id.endsWith(`/${REMINDER_CATEGORY}`))).toBe(true);
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

  it('cancels only the reminder after the deadline when that setting is switched off (SET-7)', () => {
    const on = planReminders([deadline()], DEFAULTS, OCT_18);

    const diff = diffReminders(
      planReminders([deadline()], { ...DEFAULTS, overdueReminder: false }, OCT_18),
      synced(on)
    );

    expect(diff).toEqual({ schedule: [], cancel: [on.at(-1)!.id] });
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

describe('remindTomorrowAt (REM-15)', () => {
  it('is tomorrow at the reminder time in the device’s time zone', () => {
    expect(remindTomorrowAt(new Date('2026-11-13T22:30:00+01:00'), '09:00')).toBe(
      '2026-11-14T08:00:00.000Z'
    );
    // Just after midnight it is still the next calendar day.
    expect(remindTomorrowAt(new Date('2026-11-14T00:10:00+01:00'), '18:30')).toBe(
      '2026-11-15T17:30:00.000Z'
    );
  });

  it('keeps the wall-clock time across a DST change and a month boundary', () => {
    // Clocks go back on 2026-10-25 in Berlin.
    expect(remindTomorrowAt(new Date('2026-10-24T20:00:00+02:00'), '09:00')).toBe(
      '2026-10-25T08:00:00.000Z'
    );
    expect(remindTomorrowAt(new Date('2026-11-30T12:00:00+01:00'), '09:00')).toBe(
      '2026-12-01T08:00:00.000Z'
    );
  });
});
