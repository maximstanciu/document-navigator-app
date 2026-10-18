/** @jest-environment ./src/test/time-zone-environment.js */
import { setTimeZone } from '@/test/time-zone';

import { ATTENTION_DAYS, deadlinesByDocument, selectAttention } from './attention';
import type { DeadlineSummary, DocumentSummary } from './types';

beforeEach(() => {
  setTimeZone('Europe/Berlin');
});

// 2026-10-18 11:00 in Berlin.
const NOW = new Date('2026-10-18T09:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(days: number) {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function document(id: string, overrides: Partial<DocumentSummary> = {}): DocumentSummary {
  return {
    id,
    title: `Документ ${id}`,
    status: 'ready',
    documentType: 'invoice',
    senderName: null,
    pageCount: 1,
    createdAt: daysAgo(30),
    analyzedAt: daysAgo(1),
    attentionDismissedAt: null,
    hasFraudSignals: false,
    hasHighRisk: false,
    ...overrides,
  };
}

function deadline(
  id: string,
  documentId: string,
  dueDate: string,
  dueTime: string | null = null
): DeadlineSummary {
  return { id, documentId, description: `Срок ${id}`, dueDate, dueTime };
}

const ids = (items: ReturnType<typeof selectAttention>) => items.map((item) => item.document.id);

describe('selectAttention (HOME-1)', () => {
  it('takes overdue deadlines and those due within 14 days, not later ones', () => {
    const items = selectAttention(
      [document('overdue'), document('today'), document('last-day'), document('later')],
      [
        deadline('d1', 'overdue', '2026-09-30'),
        deadline('d2', 'today', '2026-10-18'),
        deadline('d3', 'last-day', '2026-11-01'),
        deadline('d4', 'later', '2026-11-02'),
      ],
      NOW
    );

    expect(ids(items)).toEqual(['overdue', 'today', 'last-day']);
    expect(items.every((item) => !item.dismissible)).toBe(true);
  });

  it('counts the 14 days from the device’s calendar date, not UTC', () => {
    // 23:30 UTC on the 18th is already the 19th in Berlin: the window reaches 2 November.
    const lateEvening = new Date('2026-10-18T23:30:00.000Z');

    const items = selectAttention(
      [document('doc')],
      [deadline('d1', 'doc', '2026-11-02')],
      lateEvening
    );

    expect(ids(items)).toEqual(['doc']);
  });

  it('keeps only the deadlines that need attention, soonest first', () => {
    const [item] = selectAttention(
      [document('doc')],
      [
        deadline('soon', 'doc', '2026-10-20', '12:00'),
        deadline('soon-no-time', 'doc', '2026-10-20'),
        deadline('far', 'doc', '2027-01-31'),
      ],
      NOW
    );

    expect(item.deadlines.map((d) => d.id)).toEqual(['soon', 'soon-no-time']);
  });

  it('leaves out a document without warnings whose deadlines are far away', () => {
    expect(selectAttention([document('doc')], [deadline('d1', 'doc', '2027-01-31')], NOW)).toEqual(
      []
    );
  });

  it(`shows fraud signs and high risks for ${ATTENTION_DAYS} days after the analysis, with «Got it»`, () => {
    const items = selectAttention(
      [
        document('fraud', { hasFraudSignals: true, analyzedAt: daysAgo(13) }),
        document('risk', { hasHighRisk: true, analyzedAt: daysAgo(2) }),
        document('old-risk', { hasHighRisk: true, analyzedAt: daysAgo(ATTENTION_DAYS) }),
      ],
      [],
      NOW
    );

    expect(ids(items)).toEqual(['fraud', 'risk']);
    expect(items.every((item) => item.dismissible && item.deadlines.length === 0)).toBe(true);
  });

  it('hides a warning after «Got it», until a newer analysis', () => {
    const items = selectAttention(
      [
        document('seen', {
          hasFraudSignals: true,
          analyzedAt: daysAgo(3),
          attentionDismissedAt: daysAgo(2),
        }),
        document('reanalyzed', {
          hasHighRisk: true,
          analyzedAt: daysAgo(1),
          attentionDismissedAt: daysAgo(2),
        }),
      ],
      [],
      NOW
    );

    expect(ids(items)).toEqual(['reanalyzed']);
  });

  it('shows a warning with a far deadline as a warning, which «Got it» hides', () => {
    const [item] = selectAttention(
      [document('contract', { hasHighRisk: true })],
      [deadline('cancel', 'contract', '2027-01-31')],
      NOW
    );

    expect(item).toMatchObject({ deadlines: [], dismissible: true });
  });

  it('keeps a document with a near deadline whatever «Got it» said about its warnings', () => {
    const [item] = selectAttention(
      [
        document('fraud', {
          hasFraudSignals: true,
          analyzedAt: daysAgo(30),
          attentionDismissedAt: daysAgo(29),
        }),
      ],
      [deadline('pay', 'fraud', '2026-10-19')],
      NOW
    );

    expect(item).toMatchObject({ dismissible: false, document: { hasFraudSignals: true } });
  });

  it('ignores documents without an analysis', () => {
    expect(
      selectAttention([document('draft', { status: 'draft', analyzedAt: null })], [], NOW)
    ).toEqual([]);
  });

  it('puts deadlines first by due date and time, then fraud, then the newest risk', () => {
    const items = selectAttention(
      [
        document('risk-older', { hasHighRisk: true, analyzedAt: daysAgo(5) }),
        document('risk-newer', { hasHighRisk: true, analyzedAt: daysAgo(1) }),
        document('fraud', { hasFraudSignals: true, analyzedAt: daysAgo(9) }),
        document('due-afternoon'),
        document('due-morning'),
        document('overdue'),
      ],
      [
        deadline('d1', 'overdue', '2026-10-01'),
        deadline('d2', 'due-afternoon', '2026-10-21', '15:00'),
        deadline('d3', 'due-morning', '2026-10-21', '09:00'),
      ],
      NOW
    );

    expect(ids(items)).toEqual([
      'overdue',
      'due-morning',
      'due-afternoon',
      'fraud',
      'risk-newer',
      'risk-older',
    ]);
  });
});

describe('deadlinesByDocument', () => {
  it('groups deadlines by document in the order given', () => {
    const grouped = deadlinesByDocument([
      deadline('a1', 'a', '2026-10-20'),
      deadline('b1', 'b', '2026-10-21'),
      deadline('a2', 'a', '2026-10-22'),
    ]);

    expect(grouped.get('a')?.map((d) => d.id)).toEqual(['a1', 'a2']);
    expect(grouped.get('b')?.map((d) => d.id)).toEqual(['b1']);
    expect(grouped.get('c')).toBeUndefined();
  });
});
