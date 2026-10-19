import { ANALYSIS_FIXTURES, llmOutputFixture } from '@/shared/analysis/fixtures';

import { finalizeAnalysis } from './finalize-analysis';

const CONTEXT = { today: '2026-10-18', pageCount: 5 };
const fromModel = llmOutputFixture('invoice');

describe('finalizeAnalysis', () => {
  it('adds the schema version to a valid answer', () => {
    expect(finalizeAnalysis(fromModel, CONTEXT)).toEqual({
      ok: true,
      analysis: ANALYSIS_FIXTURES.invoice,
    });
  });

  it('repairs bounds instead of rejecting the answer', () => {
    const result = finalizeAnalysis({ ...fromModel, summary: 'а'.repeat(2000) }, CONTEXT);
    expect(result.ok).toBe(true);
  });

  it('counts computed dates and returns no rules (SPEC §7.4, rule 3)', () => {
    const contract = llmOutputFixture('contract');
    const [cancellation, renewal] = contract.deadlines;
    const result = finalizeAnalysis(
      { ...contract, deadlines: [{ ...cancellation, date: '2027-01-31' }, renewal] },
      CONTEXT
    );
    expect(result).toEqual({ ok: true, analysis: ANALYSIS_FIXTURES.contract });
  });

  it('ignores fields the schema does not know', () => {
    const result = finalizeAnalysis({ ...fromModel, confidence: 0.9 }, CONTEXT);
    expect(result).toEqual({ ok: true, analysis: ANALYSIS_FIXTURES.invoice });
  });

  it.each([
    ['a missing field', { ...fromModel, quality: undefined }, 'quality'],
    [
      'a deadline without a rule',
      { ...fromModel, deadlines: [{ ...fromModel.deadlines[0], rule: undefined }] },
      'deadlines[0].rule',
    ],
    ['an unknown enum value', { ...fromModel, documentType: 'receipt' }, 'documentType'],
    ['a wrong type', { ...fromModel, summary: 42 }, 'summary'],
    [
      'a page given as text',
      { ...fromModel, risks: [{ ...fromModel.risks[0], page: '2' }] },
      'risks[0].page',
    ],
    ['not an object', 'Here is the analysis: …', ''],
  ])('rejects %s and names where it is wrong', (_case, output, path) => {
    const result = finalizeAnalysis(output, CONTEXT);
    expect(result.ok).toBe(false);
    if (!result.ok && path) expect(result.error).toContain(path);
  });
});
