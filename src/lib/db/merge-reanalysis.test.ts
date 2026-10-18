import type { NewAction } from './actions-repository';
import type { NewDeadline } from './deadlines-repository';
import { mergeReanalysis, type ExistingDeadline } from './merge-reanalysis';

function existing(id: string, overrides: Partial<ExistingDeadline> = {}): ExistingDeadline {
  return {
    id,
    kind: 'payment',
    dueDate: '2026-10-31',
    originalDate: null,
    dateSource: 'explicit',
    status: 'open',
    ...overrides,
  };
}

function incoming(id: string, overrides: Partial<NewDeadline> = {}): NewDeadline {
  return {
    id,
    documentId: 'doc-1',
    kind: 'payment',
    description: `Срок ${id}`,
    dueDate: '2026-10-31',
    dateSource: 'explicit',
    confidence: 'high',
    ...overrides,
  };
}

function action(id: string, deadlineId: string | null = null): NewAction {
  return { id, documentId: 'doc-1', description: `Действие ${id}`, priority: 'high', deadlineId };
}

describe('mergeReanalysis (ANL-8)', () => {
  it('adds everything on a first analysis', () => {
    const merge = mergeReanalysis(
      { deadlines: [], actions: [] },
      { deadlines: [incoming('new')], actions: [action('a', 'new'), action('b')] }
    );

    expect(merge).toEqual({
      removeDeadlineIds: [],
      removeActionIds: [],
      insertDeadlines: [incoming('new')],
      insertActions: [action('a', 'new'), action('b')],
    });
  });

  it('replaces open deadlines from the analysis and every action not due by a kept deadline', () => {
    const merge = mergeReanalysis(
      {
        deadlines: [existing('open'), existing('done', { status: 'done', kind: 'response' })],
        actions: [
          { id: 'of-open', deadlineId: 'open' },
          { id: 'of-done', deadlineId: 'done' },
          { id: 'undated', deadlineId: null },
        ],
      },
      { deadlines: [incoming('new')], actions: [action('new-undated')] }
    );

    expect(merge.removeDeadlineIds).toEqual(['open']);
    expect(merge.removeActionIds).toEqual(['of-open', 'undated']);
    expect(merge.insertDeadlines.map((d) => d.id)).toEqual(['new']);
    expect(merge.insertActions.map((a) => a.id)).toEqual(['new-undated']);
  });

  it.each([
    ['a date the person set', { dateSource: 'user' as const }],
    ['done', { status: 'done' as const }],
    ['not relevant', { status: 'dismissed' as const }],
  ])('keeps a deadline with %s and its actions', (_, overrides) => {
    const merge = mergeReanalysis(
      { deadlines: [existing('kept', overrides)], actions: [{ id: 'pay', deadlineId: 'kept' }] },
      { deadlines: [], actions: [] }
    );

    expect(merge.removeDeadlineIds).toEqual([]);
    expect(merge.removeActionIds).toEqual([]);
  });

  it.each([
    ['the same day', '2026-10-31', true],
    ['a day earlier', '2026-10-30', true],
    ['a day later, across a month', '2026-11-01', true],
    ['two days later', '2026-11-02', false],
  ])('drops a new deadline of the same kind on %s as a duplicate: %s', (_, dueDate, dropped) => {
    const merge = mergeReanalysis(
      { deadlines: [existing('kept', { status: 'done' })], actions: [] },
      { deadlines: [incoming('new', { dueDate })], actions: [action('pay', 'new')] }
    );

    expect(merge.insertDeadlines.map((d) => d.id)).toEqual(dropped ? [] : ['new']);
    // An action due by a dropped duplicate goes with it: the kept deadline has its own.
    expect(merge.insertActions.map((a) => a.id)).toEqual(dropped ? [] : ['pay']);
  });

  it('does not take a deadline of another kind on the same day for a duplicate', () => {
    const merge = mergeReanalysis(
      { deadlines: [existing('kept', { status: 'done' })], actions: [] },
      { deadlines: [incoming('new', { kind: 'cancellation' })], actions: [] }
    );

    expect(merge.insertDeadlines.map((d) => d.id)).toEqual(['new']);
  });

  it('recognizes a deadline whose date the person changed by the date the analysis gave', () => {
    const kept = existing('kept', {
      dateSource: 'user',
      dueDate: '2026-11-14',
      originalDate: '2026-10-31',
    });

    const merge = mergeReanalysis(
      { deadlines: [kept], actions: [] },
      {
        deadlines: [
          incoming('old-date-again', { dueDate: '2026-10-31' }),
          incoming('near-new-date', { dueDate: '2026-11-15' }),
          incoming('other', { dueDate: '2026-11-07' }),
        ],
        actions: [],
      }
    );

    expect(merge.insertDeadlines.map((d) => d.id)).toEqual(['other']);
  });

  it('does not count an open deadline from the analysis as kept for duplicates', () => {
    const merge = mergeReanalysis(
      { deadlines: [existing('open')], actions: [] },
      { deadlines: [incoming('new')], actions: [] }
    );

    expect(merge.removeDeadlineIds).toEqual(['open']);
    expect(merge.insertDeadlines.map((d) => d.id)).toEqual(['new']);
  });
});
