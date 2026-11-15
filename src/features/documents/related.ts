import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';

/**
 * What the row of a related document says about it (LINK-3): its nearest open deadline, or that
 * everything in it is marked done; `null` — nothing to say.
 */
export type RelatedState =
  { kind: 'deadline'; deadline: DeadlineRecord } | { kind: 'allDone' } | null;

/**
 * The state of a document for the row another document shows about it (LINK-3). `deadlines` are its
 * deadlines, soonest first, whatever their status; `actions` are its actions. «Everything is marked
 * done» needs a mark: a document that asked for nothing says nothing. What hangs on a deadline
 * marked «Not relevant» is no longer left to do.
 */
export function relatedState(
  deadlines: readonly DeadlineRecord[],
  actions: readonly ActionRecord[]
): RelatedState {
  const open = deadlines.find((deadline) => deadline.status === 'open');
  if (open) return { kind: 'deadline', deadline: open };

  const dismissed = new Set(
    deadlines.filter((deadline) => deadline.status === 'dismissed').map((deadline) => deadline.id)
  );
  const left = actions.some(
    (action) => !action.done && !(action.deadlineId !== null && dismissed.has(action.deadlineId))
  );
  if (left) return null;

  const marked =
    actions.some((action) => action.done) ||
    deadlines.some((deadline) => deadline.status === 'done');
  return marked ? { kind: 'allDone' } : null;
}
