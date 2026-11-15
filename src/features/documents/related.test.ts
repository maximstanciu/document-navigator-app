import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';

import { relatedState } from './related';

function deadline(id: string, status: DeadlineRecord['status'], dueDate = '2026-10-31') {
  return { id, status, dueDate } as DeadlineRecord;
}

function action(done: boolean, deadlineId: string | null = null) {
  return { done, deadlineId } as ActionRecord;
}

describe('relatedState (LINK-3)', () => {
  it('is the nearest open deadline, given the deadlines soonest first', () => {
    const state = relatedState(
      [
        deadline('paid', 'done', '2026-09-30'),
        deadline('next', 'open', '2026-10-15'),
        deadline('later', 'open', '2026-11-30'),
      ],
      [action(true, 'paid')]
    );

    expect(state).toEqual({ kind: 'deadline', deadline: expect.objectContaining({ id: 'next' }) });
  });

  it('is «everything is marked done» without open deadlines and actions left, with a mark', () => {
    expect(relatedState([deadline('paid', 'done')], [action(true, 'paid')])).toEqual({
      kind: 'allDone',
    });
    // A deadline without actions marked done itself, and an action without a date.
    expect(relatedState([deadline('paid', 'done')], [])).toEqual({ kind: 'allDone' });
    expect(relatedState([], [action(true)])).toEqual({ kind: 'allDone' });
  });

  it('says nothing while an action is left to do', () => {
    expect(relatedState([deadline('paid', 'done')], [action(true, 'paid'), action(false)])).toBe(
      null
    );
  });

  it('says nothing about a document that asked for nothing, or where nothing was marked', () => {
    expect(relatedState([], [])).toBeNull();
    expect(relatedState([deadline('old', 'dismissed')], [])).toBeNull();
    expect(relatedState([], [action(false)])).toBeNull();
  });

  it('does not count the actions of a deadline marked «Not relevant» as left to do', () => {
    const deadlines = [deadline('paid', 'done'), deadline('old', 'dismissed')];

    expect(relatedState(deadlines, [action(true, 'paid'), action(false, 'old')])).toEqual({
      kind: 'allDone',
    });
    expect(relatedState([deadline('old', 'dismissed')], [action(false, 'old')])).toBeNull();
  });
});
