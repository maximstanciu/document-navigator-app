import { ANALYSIS_FIXTURES } from '@/shared/analysis/fixtures';
import type { AnalysisResult } from '@/shared/analysis/schema';

import { analysisRecords } from './analysis-records';

function sequentialIds() {
  let next = 0;
  return () => `id-${++next}`;
}

describe('analysisRecords', () => {
  it('makes records of the deadlines, with their quotes, and of the actions linked to them', () => {
    const { deadlines, actions } = analysisRecords(
      'doc-1',
      ANALYSIS_FIXTURES.invoice,
      sequentialIds()
    );

    expect(deadlines).toEqual([
      {
        id: 'id-1',
        documentId: 'doc-1',
        kind: 'payment',
        description: 'Оплатить счёт за электричество',
        dueDate: '2026-10-31',
        dueTime: null,
        dateSource: 'explicit',
        sourceQuote: 'Bitte überweisen Sie den Rechnungsbetrag von 84,20 € bis zum 31.10.2026.',
        sourcePage: 1,
        computation: null,
        confidence: 'high',
      },
    ]);
    expect(actions).toEqual([
      {
        id: 'id-2',
        documentId: 'doc-1',
        description: 'Оплатить 84,20 € переводом, указав номер клиента в назначении платежа',
        priority: 'high',
        deadlineId: 'id-1',
      },
    ]);
  });

  it('links several actions to one deadline', () => {
    const { deadlines, actions } = analysisRecords(
      'doc-1',
      ANALYSIS_FIXTURES.officialNotice,
      sequentialIds()
    );

    expect(actions.length).toBeGreaterThan(1);
    expect(actions.filter((action) => action.deadlineId === deadlines[0].id)).toHaveLength(2);
  });

  it('keeps an action without a deadline, or with one that is not there, without a date', () => {
    const analysis: AnalysisResult = {
      ...ANALYSIS_FIXTURES.invoice,
      actions: [
        { id: 'a1', description: 'Проверить отправителя', priority: 'high', deadlineId: null },
        { id: 'a2', description: 'Оплатить', priority: 'medium', deadlineId: 'd9' },
      ],
    };

    const { actions } = analysisRecords('doc-1', analysis, sequentialIds());

    expect(actions.map((action) => action.deadlineId)).toEqual([null, null]);
  });

  it('links to the first of two deadlines that share an id', () => {
    const [deadline] = ANALYSIS_FIXTURES.invoice.deadlines;
    const analysis: AnalysisResult = {
      ...ANALYSIS_FIXTURES.invoice,
      deadlines: [deadline, { ...deadline, date: '2026-11-30' }],
    };

    const { deadlines, actions } = analysisRecords('doc-1', analysis, sequentialIds());

    expect(actions[0].deadlineId).toBe(deadlines[0].id);
  });

  it('has nothing to store for an unreadable document', () => {
    expect(analysisRecords('doc-1', ANALYSIS_FIXTURES.unreadable, sequentialIds())).toEqual({
      deadlines: [],
      actions: [],
    });
  });
});
