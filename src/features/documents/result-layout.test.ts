import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';

import { arrangeResult, sortRisks } from './result-layout';

const TIMESTAMP = '2026-10-17T09:00:00.000Z';

function deadline(id: string, dueDate: string, status: DeadlineRecord['status'] = 'open') {
  return {
    id,
    documentId: 'doc-1',
    kind: 'payment',
    description: `Срок ${id}`,
    dueDate,
    dueTime: null,
    dateSource: 'explicit',
    originalDate: null,
    sourceQuote: null,
    sourcePage: null,
    computation: null,
    confidence: 'high',
    status,
    reminderOffsetsDays: null,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
  } satisfies DeadlineRecord;
}

function action(id: string, deadlineId: string | null) {
  return {
    id,
    documentId: 'doc-1',
    deadlineId,
    description: `Действие ${id}`,
    priority: 'high',
    done: false,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    deletedAt: null,
  } satisfies ActionRecord;
}

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('arrangeResult (DET-3, DET-4)', () => {
  it('shows a deadline with actions among the actions and the others under «Deadlines», once each', () => {
    const deadlines = [deadline('d-soon', '2026-10-20'), deadline('d-later', '2026-11-20')];

    const layout = arrangeResult(deadlines, [action('a1', 'd-later'), action('a2', 'd-later')]);

    expect(layout.actionGroups).toEqual([
      { deadline: deadlines[1], actions: [action('a1', 'd-later'), action('a2', 'd-later')] },
    ]);
    expect(ids(layout.deadlines)).toEqual(['d-soon']);
  });

  it('puts the soonest deadline first and actions without a date last', () => {
    const layout = arrangeResult(
      [deadline('d1', '2026-10-20'), deadline('d2', '2026-11-20')],
      [action('undated', null), action('a2', 'd2'), action('a1', 'd1')]
    );

    expect(layout.actionGroups.map((group) => group.deadline?.id ?? null)).toEqual([
      'd1',
      'd2',
      null,
    ]);
    expect(ids(layout.actionGroups[2].actions)).toEqual(['undated']);
  });

  it('treats an action whose deadline is gone as one without a date', () => {
    const layout = arrangeResult([], [action('a1', 'deleted-deadline')]);

    expect(layout.actionGroups).toEqual([
      { deadline: null, actions: [action('a1', 'deleted-deadline')] },
    ]);
  });

  it('keeps deadlines marked «Not relevant» apart, in both blocks', () => {
    const layout = arrangeResult(
      [deadline('d1', '2026-10-20', 'dismissed'), deadline('d2', '2026-11-20', 'dismissed')],
      [action('a1', 'd1')]
    );

    expect(layout.actionGroups).toEqual([]);
    expect(layout.deadlines).toEqual([]);
    expect(layout.dismissedActionGroups.map((group) => group.deadline?.id)).toEqual(['d1']);
    expect(ids(layout.dismissedDeadlines)).toEqual(['d2']);
  });

  it('keeps a done deadline in its place', () => {
    const layout = arrangeResult([deadline('d1', '2026-10-20', 'done')], []);

    expect(ids(layout.deadlines)).toEqual(['d1']);
  });
});

describe('sortRisks (DET-5)', () => {
  it('lists the most severe first and keeps the analysis order within a level', () => {
    const risk = (title: string, severity: 'high' | 'medium' | 'low') => ({
      severity,
      title,
      explanation: '',
      sourceQuote: null,
      page: null,
    });

    const sorted = sortRisks([
      risk('low', 'low'),
      risk('medium-1', 'medium'),
      risk('high', 'high'),
      risk('medium-2', 'medium'),
    ]);

    expect(sorted.map((item) => item.title)).toEqual(['high', 'medium-1', 'medium-2', 'low']);
  });

  it('does not change the analysis it was given', () => {
    const { risks } = ANALYSIS_FIXTURES.contract;
    const before = [...risks];

    sortRisks(risks);

    expect(risks).toEqual(before);
  });
});
