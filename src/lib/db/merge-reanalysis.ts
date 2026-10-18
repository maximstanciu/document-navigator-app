import { daysBetween } from '@/shared/calendar-date';

import type { NewAction } from './actions-repository';
import type { NewDeadline } from './deadlines-repository';
import type { ActionRecord, DeadlineRecord } from './types';

/** A deadline the document already has, as much of it as the merge looks at. */
export type ExistingDeadline = Pick<
  DeadlineRecord,
  'id' | 'kind' | 'dueDate' | 'originalDate' | 'dateSource' | 'status'
>;

export type ExistingAction = Pick<ActionRecord, 'id' | 'deadlineId'>;

export type ReanalysisMerge = {
  /** Old deadlines and actions the new analysis replaces. */
  removeDeadlineIds: string[];
  removeActionIds: string[];
  /** New deadlines and actions to add next to the kept ones. */
  insertDeadlines: NewDeadline[];
  insertActions: NewAction[];
};

/** What the person did to a deadline outlives a new analysis: a date they set, «Done», «Not relevant». */
function isKept(deadline: ExistingDeadline) {
  return deadline.dateSource === 'user' || deadline.status !== 'open';
}

/**
 * A new deadline of the same kind within a day of a kept one, or of the date the analysis gave
 * before the person changed it, is that deadline found again.
 */
function isDuplicate(deadline: NewDeadline, kept: readonly ExistingDeadline[]) {
  return kept.some(
    (old) =>
      old.kind === deadline.kind &&
      [old.dueDate, old.originalDate].some(
        (date) => date !== null && Math.abs(daysBetween(date, deadline.dueDate)) <= 1
      )
  );
}

/**
 * The re-analysis merge (ANL-8). Kept: deadlines with a date the person set, and deadlines that are
 * `done` or `dismissed`, together with their actions. Everything else old is replaced by the new
 * analysis, minus the new deadlines that duplicate a kept one and the actions due by those. On a
 * first analysis nothing exists yet, and everything new is added.
 */
export function mergeReanalysis(
  existing: { deadlines: readonly ExistingDeadline[]; actions: readonly ExistingAction[] },
  incoming: { deadlines: readonly NewDeadline[]; actions: readonly NewAction[] }
): ReanalysisMerge {
  const kept = existing.deadlines.filter(isKept);
  const keptIds = new Set(kept.map((deadline) => deadline.id));
  const duplicateIds = new Set(
    incoming.deadlines
      .filter((deadline) => isDuplicate(deadline, kept))
      .map((deadline) => deadline.id)
  );

  return {
    removeDeadlineIds: existing.deadlines
      .filter((deadline) => !keptIds.has(deadline.id))
      .map((deadline) => deadline.id),
    removeActionIds: existing.actions
      .filter((action) => action.deadlineId === null || !keptIds.has(action.deadlineId))
      .map((action) => action.id),
    insertDeadlines: incoming.deadlines.filter((deadline) => !duplicateIds.has(deadline.id)),
    insertActions: incoming.actions.filter(
      (action) => !action.deadlineId || !duplicateIds.has(action.deadlineId)
    ),
  };
}
