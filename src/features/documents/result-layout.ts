import type { ActionRecord, DeadlineRecord } from '@/lib/db/types';
import type { AnalysisResult, Level } from '@/shared/analysis/schema';

import type { ActionGroup } from './types';

export type ResultLayout = {
  /** «What to do» (DET-3): deadlines with their actions, soonest first, then undated actions. */
  actionGroups: ActionGroup[];
  /** «Deadlines» (DET-4): deadlines no action belongs to, soonest first. */
  deadlines: DeadlineRecord[];
  /** Marked «Not relevant»: collapsed at the end of their block, with «Restore» (DET-4). */
  dismissedActionGroups: ActionGroup[];
  dismissedDeadlines: DeadlineRecord[];
};

/**
 * Places every deadline in exactly one block: a deadline with actions shows in «What to do» with
 * them, the others in «Deadlines» (DET-3). `deadlines` come soonest first, as the repository lists
 * them; actions keep the order the analysis gave them.
 */
export function arrangeResult(
  deadlines: readonly DeadlineRecord[],
  actions: readonly ActionRecord[]
): ResultLayout {
  const known = new Set(deadlines.map((deadline) => deadline.id));
  const byDeadline = new Map<string, ActionRecord[]>();
  const undated: ActionRecord[] = [];
  for (const action of actions) {
    if (action.deadlineId && known.has(action.deadlineId)) {
      byDeadline.set(action.deadlineId, [...(byDeadline.get(action.deadlineId) ?? []), action]);
    } else {
      undated.push(action);
    }
  }

  const layout: ResultLayout = {
    actionGroups: [],
    deadlines: [],
    dismissedActionGroups: [],
    dismissedDeadlines: [],
  };
  for (const deadline of deadlines) {
    const dismissed = deadline.status === 'dismissed';
    const linked = byDeadline.get(deadline.id);
    if (linked) {
      const group = { deadline, actions: linked };
      (dismissed ? layout.dismissedActionGroups : layout.actionGroups).push(group);
    } else {
      (dismissed ? layout.dismissedDeadlines : layout.deadlines).push(deadline);
    }
  }
  if (undated.length > 0) layout.actionGroups.push({ deadline: null, actions: undated });
  return layout;
}

const SEVERITY_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 };

/** Risks from the most to the least severe, in the analysis order within a level (DET-5). */
export function sortRisks(risks: AnalysisResult['risks']): AnalysisResult['risks'] {
  return [...risks].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
