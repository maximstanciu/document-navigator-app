import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { i18n } from '@/lib/i18n/i18n';

import { calendarEventFor } from './calendar-event';

const t = i18n.getFixedT('en');

const deadline: DeadlineRecord = {
  id: 'pay',
  documentId: 'bill',
  kind: 'payment',
  description: ' Pay the electricity bill ',
  dueDate: '2026-11-20',
  dueTime: null,
  dateSource: 'explicit',
  originalDate: null,
  sourceQuote: 'Payable by 20.11.2026',
  sourcePage: 1,
  computation: null,
  confidence: 'high',
  status: 'open',
  reminderOffsetsDays: null,
  createdAt: '2026-10-20T10:00:00.000Z',
  updatedAt: '2026-10-20T10:00:00.000Z',
  deletedAt: null,
};

function action(id: string, description: string, done = false): ActionRecord {
  return {
    id,
    documentId: 'bill',
    deadlineId: 'pay',
    description,
    priority: 'high',
    done,
    createdAt: '2026-10-20T10:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    deletedAt: null,
  };
}

describe('calendarEventFor', () => {
  it('takes the deadline as the title and names the document in the notes (REM-10)', () => {
    expect(calendarEventFor(deadline, [], 'Electricity bill', t)).toEqual({
      title: 'Pay the electricity bill',
      date: '2026-11-20',
      time: null,
      notes: 'Document: Electricity bill',
    });
  });

  it('keeps the due time', () => {
    expect(calendarEventFor({ ...deadline, dueTime: '14:00' }, [], 'Bill', t).time).toBe('14:00');
  });

  it('lists what is left to do, without done actions or one that repeats the title', () => {
    const actions = [
      action('transfer', 'Transfer 84.20 €'),
      action('keep', 'Keep the receipt', true),
      action('same', 'Pay the electricity bill'),
    ];

    expect(calendarEventFor(deadline, actions, 'Electricity bill', t).notes).toBe(
      '• Transfer 84.20 €\nDocument: Electricity bill'
    );
  });

  it('says how a computed date was derived and to check it (ANL-6)', () => {
    const computed = {
      ...deadline,
      dateSource: 'computed' as const,
      computation: '14 days from the letter of 06.11.2026',
      confidence: 'medium' as const,
    };

    expect(calendarEventFor(computed, [], 'Electricity bill', t).notes).toBe(
      [
        'Document: Electricity bill',
        'Calculated: 14 days from the letter of 06.11.2026',
        'Check this date against the original.',
      ].join('\n')
    );
  });

  it('asks to check an uncertain date, but not one the person set', () => {
    const uncertain = { ...deadline, confidence: 'low' as const };

    expect(calendarEventFor(uncertain, [], 'Bill', t).notes).toBe(
      'Document: Bill\nCheck this date against the original.'
    );
    expect(
      calendarEventFor(
        { ...uncertain, dateSource: 'user', originalDate: '2026-11-13' },
        [],
        'Bill',
        t
      ).notes
    ).toBe('Document: Bill');
  });
});
